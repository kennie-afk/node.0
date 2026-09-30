/**
 * The double-entry engine. `postEntry` is the only way a journal line comes into existence, and it
 * enforces in code what the database also enforces in triggers:
 *   - at least two lines, each a positive integer on exactly one side;
 *   - debits equal credits, overall and within every fund;
 *   - every account and fund belongs to the church, is active, and is postable;
 *   - the period is open;
 *   - the entry joins a per-church hash chain and takes a gapless number;
 *   - the running balances are updated in the same transaction.
 */
import { Transaction } from 'sequelize';
import db from '@models';
import { currentTenantOrNull } from '../../common/tenant-context';
import { MAX_MINOR, toInt } from '../../common/money';
import { bumpTenantCache } from '../../common/cache';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { exec, execCount, select, selectOne } from './sql';
import { GENESIS_HASH, dateOnly, iso, lockChain, sha256 } from './chain';
import { getPeriod, resolvePeriod } from './periods.service';
import { loadSettings } from './setup.service';
import { recordLedgerPosting } from '../../common/metrics';

export interface PostLine {
  accountId: number;
  fundId: number;
  debit?: number;
  credit?: number;
  memberId?: number | null;
  ministryId?: number | null;
  memo?: string | null;
}

export interface PostEntryInput {
  entryDate: string;
  memo: string;
  sourceType: string;
  sourceId?: string | number | null;
  lines: PostLine[];
  idempotencyKey?: string | null;
  reversesEntryId?: number | null;
  actorId?: number | null;
  /** Post into a specific period instead of the one containing entryDate (year-end closing only). */
  periodId?: number;
}

export interface PostedEntry {
  id: number;
  entryNo: number;
  entryDate: string;
  periodId: number;
  totalMinor: number;
  hash: string;
  replayed: boolean;
}

interface NormalLine {
  lineNo: number;
  accountId: number;
  fundId: number;
  debit: number;
  credit: number;
  memberId: number | null;
  ministryId: number | null;
  memo: string | null;
}

function normalise(lines: PostLine[]): { lines: NormalLine[]; total: number } {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new BadRequestError('a journal entry needs at least two lines');
  }
  if (lines.length > 500) {
    throw new BadRequestError('a journal entry may have at most 500 lines');
  }
  let debits = 0;
  let credits = 0;
  const funds = new Map<number, number>();
  const out = lines.map((line, index) => {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;
    for (const value of [debit, credit]) {
      if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MINOR) {
        throw new BadRequestError(`line ${index + 1}: amounts must be whole minor units between 0 and ${MAX_MINOR}`);
      }
    }
    if ((debit === 0) === (credit === 0)) {
      throw new BadRequestError(`line ${index + 1}: a line is either a debit or a credit, and must not be zero`);
    }
    debits += debit;
    credits += credit;
    funds.set(line.fundId, (funds.get(line.fundId) ?? 0) + debit - credit);
    return {
      lineNo: index + 1,
      accountId: line.accountId,
      fundId: line.fundId,
      debit,
      credit,
      memberId: line.memberId ?? null,
      ministryId: line.ministryId ?? null,
      memo: line.memo ? String(line.memo).slice(0, 255) : null
    };
  });
  if (debits !== credits) {
    throw new BadRequestError(`the entry does not balance: debits ${debits}, credits ${credits} (minor units)`);
  }
  for (const [fundId, net] of funds) {
    if (net !== 0) {
      throw new BadRequestError(`the entry does not balance within fund ${fundId}; move money between funds with an interfund transfer`);
    }
  }
  return { lines: out, total: debits };
}

export function entryHash(prev: string, e: {
  churchId: number;
  entryNo: number;
  entryDate: string;
  sourceType: string;
  sourceId: string | null;
  memo: string;
  createdBy: number | null;
  postedAt: string;
  reverses: number | null;
  lines: Array<{ lineNo: number; accountId: number; fundId: number; debit: number; credit: number; memberId: number | null; ministryId: number | null }>;
}): string {
  const lines = e.lines
    .map((l) => [l.lineNo, l.accountId, l.fundId, l.debit, l.credit, l.memberId ?? '', l.ministryId ?? ''].join(':'))
    .join(';');
  return sha256([prev, e.churchId, e.entryNo, e.entryDate, e.sourceType, e.sourceId ?? '', e.memo, e.createdBy ?? '', e.postedAt, e.reverses ?? '', lines].join('|'));
}

function placeholders(rows: number, columns: number): string {
  const one = `(${Array(columns).fill('?').join(',')})`;
  return Array(rows).fill(one).join(',');
}

async function assertRefs(t: Transaction, churchId: number, lines: NormalLine[]): Promise<void> {
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await select<any>(
    t,
    `SELECT id, is_postable, is_active, code FROM accounts WHERE church_id = ? AND id IN (${accountIds.map(() => '?').join(',')})`,
    [churchId, ...accountIds]
  );
  const byId = new Map(accounts.map((a) => [toInt(a.id), a]));
  for (const id of accountIds) {
    const account = byId.get(id);
    if (!account) throw new BadRequestError(`account ${id} does not exist in this church`);
    const active = account.is_active === true || account.is_active === 1;
    const postable = account.is_postable === true || account.is_postable === 1;
    if (!active) throw new BadRequestError(`account ${account.code} is inactive`);
    if (!postable) throw new BadRequestError(`account ${account.code} is a heading and cannot be posted to`);
  }
  const fundIds = [...new Set(lines.map((l) => l.fundId))];
  const funds = await select<any>(
    t,
    `SELECT id, is_active, code FROM funds WHERE church_id = ? AND id IN (${fundIds.map(() => '?').join(',')})`,
    [churchId, ...fundIds]
  );
  const fundById = new Map(funds.map((f) => [toInt(f.id), f]));
  for (const id of fundIds) {
    const fund = fundById.get(id);
    if (!fund) throw new BadRequestError(`fund ${id} does not exist in this church`);
    if (!(fund.is_active === true || fund.is_active === 1)) throw new BadRequestError(`fund ${fund.code} is inactive`);
  }
}

/** Net position of a fund: everything it has earned, less everything it has spent. */
export async function fundPosition(t: Transaction, churchId: number, fundId: number): Promise<number> {
  const row = await selectOne<any>(
    t,
    `SELECT COALESCE(SUM(b.credit_minor - b.debit_minor), 0) AS net
       FROM ledger_balances b JOIN accounts a ON a.church_id = b.church_id AND a.id = b.account_id
      WHERE b.church_id = :churchId AND b.fund_id = :fundId AND a.type IN ('INCOME','EXPENSE','EQUITY')`,
    { churchId, fundId }
  );
  return toInt(row?.net);
}

async function guardRestrictedFunds(t: Transaction, churchId: number, lines: NormalLine[]): Promise<void> {
  const settings = await loadSettings(t, churchId);
  if (settings.allowRestrictedOverspend) return;
  const spentFunds = [...new Set(lines.filter((l) => l.debit > 0).map((l) => l.fundId))];
  if (spentFunds.length === 0) return;
  const restricted = await select<any>(
    t,
    `SELECT id, code FROM funds WHERE church_id = ? AND restriction <> 'UNRESTRICTED' AND id IN (${spentFunds.map(() => '?').join(',')})`,
    [churchId, ...spentFunds]
  );
  for (const fund of restricted) {
    const net = await fundPosition(t, churchId, toInt(fund.id));
    if (net < 0) {
      throw new ConflictError(`fund ${fund.code} is restricted and this entry would overspend it by ${(-net / 100).toFixed(2)}`);
    }
  }
}

/** Runs `work` inside the current request transaction, or a fresh one outside a request. */
export async function withTx<T>(work: (t: Transaction) => Promise<T>): Promise<T> {
  return db.sequelize.transaction(work as any) as Promise<T>;
}

export async function postEntry(input: PostEntryInput, t: Transaction, churchIdOverride?: number): Promise<PostedEntry> {
  const churchId = churchIdOverride ?? currentTenantOrNull()?.churchId;
  if (!churchId) throw new Error('postEntry needs a church in scope');
  const actorId = input.actorId ?? currentTenantOrNull()?.userId ?? null;
  const memo = (input.memo ?? '').trim();
  if (!memo) throw new BadRequestError('a journal entry needs a memo');
  if (memo.length > 500) throw new BadRequestError('memo is too long (500 characters)');
  const { lines, total } = normalise(input.lines);

  if (input.idempotencyKey) {
    const prior = await selectOne<any>(
      t,
      `SELECT id, entry_no, entry_date, period_id, total_minor, hash FROM journal_entries WHERE church_id = :churchId AND idempotency_key = :key`,
      { churchId, key: input.idempotencyKey }
    );
    if (prior) {
      return {
        id: toInt(prior.id),
        entryNo: toInt(prior.entry_no),
        entryDate: dateOnly(prior.entry_date),
        periodId: toInt(prior.period_id),
        totalMinor: toInt(prior.total_minor),
        hash: String(prior.hash).trim(),
        replayed: true
      };
    }
  }

  await assertRefs(t, churchId, lines);
  const period = input.periodId ? await getPeriod(t, churchId, input.periodId) : await resolvePeriod(t, churchId, input.entryDate);
  if (period.status !== 'OPEN') {
    throw new ConflictError(`${period.name} is ${period.status.toLowerCase()}; postings into it are refused`);
  }

  const chain = await lockChain(t, churchId);
  const entryNo = chain.nextEntryNo;
  const postedAt = new Date();
  const sourceId = input.sourceId === undefined || input.sourceId === null ? null : String(input.sourceId);
  const hash = entryHash(chain.lastEntryHash, {
    churchId,
    entryNo,
    entryDate: input.entryDate,
    sourceType: input.sourceType,
    sourceId,
    memo,
    createdBy: actorId,
    postedAt: postedAt.toISOString(),
    reverses: input.reversesEntryId ?? null,
    lines
  });

  await exec(
    t,
    `INSERT INTO journal_entries
       (church_id, entry_no, entry_date, period_id, memo, source_type, source_id, reverses_entry_id, total_minor, created_by, posted_at, idempotency_key, prev_hash, hash)
     VALUES (:churchId, :entryNo, :entryDate, :periodId, :memo, :sourceType, :sourceId, :reverses, :total, :actorId, :postedAt, :key, :prev, :hash)`,
    {
      churchId,
      entryNo,
      entryDate: input.entryDate,
      periodId: period.id,
      memo,
      sourceType: input.sourceType,
      sourceId,
      reverses: input.reversesEntryId ?? null,
      total,
      actorId,
      postedAt,
      key: input.idempotencyKey ?? null,
      prev: chain.lastEntryHash,
      hash
    }
  );
  const created = await selectOne<any>(t, `SELECT id FROM journal_entries WHERE church_id = :churchId AND entry_no = :entryNo`, { churchId, entryNo });
  const entryId = toInt(created!.id);

  const values: unknown[] = [];
  for (const line of lines) {
    values.push(
      churchId, entryId, line.lineNo, line.accountId, line.fundId, line.debit, line.credit,
      line.memberId, line.ministryId, line.memo, input.entryDate, period.id
    );
  }
  await exec(
    t,
    `INSERT INTO journal_lines (church_id, entry_id, line_no, account_id, fund_id, debit_minor, credit_minor, member_id, ministry_id, memo, entry_date, period_id)
     VALUES ${placeholders(lines.length, 12)}`,
    values
  );

  // Running balances. Keys are aggregated first (one row per account+fund) and applied in sorted
  // order so two concurrent postings always lock rows in the same order and cannot deadlock.
  const deltas = new Map<string, { accountId: number; fundId: number; debit: number; credit: number }>();
  for (const line of lines) {
    const key = `${line.accountId}:${line.fundId}`;
    const slot = deltas.get(key) ?? { accountId: line.accountId, fundId: line.fundId, debit: 0, credit: 0 };
    slot.debit += line.debit;
    slot.credit += line.credit;
    deltas.set(key, slot);
  }
  const sorted = [...deltas.values()].sort((a, b) => a.accountId - b.accountId || a.fundId - b.fundId);
  const balanceValues: unknown[] = [];
  for (const d of sorted) balanceValues.push(churchId, period.id, d.accountId, d.fundId, d.debit, d.credit);
  await exec(
    t,
    `INSERT INTO ledger_balances (church_id, period_id, account_id, fund_id, debit_minor, credit_minor)
     VALUES ${placeholders(sorted.length, 6)}
     ON CONFLICT (church_id, period_id, account_id, fund_id) DO UPDATE SET
       debit_minor = ledger_balances.debit_minor + EXCLUDED.debit_minor,
       credit_minor = ledger_balances.credit_minor + EXCLUDED.credit_minor`,
    balanceValues
  );

  await guardRestrictedFunds(t, churchId, lines);

  await exec(
    t,
    `UPDATE finance_chain SET next_entry_no = :next, last_entry_hash = :hash, updated_at = :now WHERE church_id = :churchId`,
    { next: entryNo + 1, hash, now: postedAt, churchId }
  );
  t.afterCommit(() => {
    recordLedgerPosting(input.sourceType);
    void bumpTenantCache(churchId);
  }); // orphan cached reports once this posting is durable

  return { id: entryId, entryNo, entryDate: input.entryDate, periodId: period.id, totalMinor: total, hash, replayed: false };
}

export interface ReverseOptions {
  reason: string;
  date?: string;
  actorId?: number | null;
  /** Reverse entries posted by other modules; their own void flows pass true. */
  allowSourced?: boolean;
}

export async function reverseEntry(t: Transaction, churchId: number, entryId: number, options: ReverseOptions): Promise<PostedEntry> {
  const original = await selectOne<any>(t, `SELECT * FROM journal_entries WHERE church_id = :churchId AND id = :entryId`, { churchId, entryId });
  if (!original) throw new NotFoundError(`journal entry ${entryId} was not found`);
  if (original.reversed_by_entry_id) throw new ConflictError(`entry ${original.entry_no} has already been reversed`);
  if (original.source_type !== 'MANUAL' && original.source_type !== 'REVERSAL' && !options.allowSourced) {
    throw new ConflictError(`entry ${original.entry_no} was posted by ${original.source_type.toLowerCase()}; void it from there so both stay in step`);
  }
  if (original.source_type === 'CLOSING') throw new ConflictError('closing entries cannot be reversed; reopen the fiscal year process instead');

  const lines = await select<any>(t, `SELECT * FROM journal_lines WHERE church_id = :churchId AND entry_id = :entryId ORDER BY line_no`, { churchId, entryId });
  const date = options.date ?? dateOnly(original.entry_date);
  const reversal = await postEntry(
    {
      entryDate: date,
      memo: `Reversal of #${original.entry_no}: ${options.reason}`.slice(0, 500),
      sourceType: 'REVERSAL',
      sourceId: entryId,
      reversesEntryId: entryId,
      actorId: options.actorId,
      lines: lines.map((line) => ({
        accountId: toInt(line.account_id),
        fundId: toInt(line.fund_id),
        debit: toInt(line.credit_minor),
        credit: toInt(line.debit_minor),
        memberId: line.member_id === null ? null : toInt(line.member_id),
        ministryId: line.ministry_id === null ? null : toInt(line.ministry_id),
        memo: line.memo
      }))
    },
    t,
    churchId
  );
  const changed = await execCount(
    t,
    `UPDATE journal_entries SET reversed_by_entry_id = :reversal WHERE church_id = :churchId AND id = :entryId AND reversed_by_entry_id IS NULL`,
    { reversal: reversal.id, churchId, entryId }
  );
  if (changed !== 1) throw new ConflictError('the entry was reversed by someone else at the same moment');
  return reversal;
}

export interface IntegrityReport {
  ok: boolean;
  entries: number;
  lines: number;
  issues: string[];
}

/**
 * Recomputes the books from first principles: every hash, every link in the chain, entry
 * numbering, balance of each entry, and the running balances table against the lines.
 */
export async function verifyLedger(t: Transaction, churchId: number): Promise<IntegrityReport> {
  const issues: string[] = [];
  let prev = GENESIS_HASH;
  let expected = 1;
  let entries = 0;
  let lineCount = 0;
  let after = 0;
  for (;;) {
    const batch = await select<any>(
      t,
      `SELECT * FROM journal_entries WHERE church_id = :churchId AND entry_no > :after ORDER BY entry_no LIMIT 300`,
      { churchId, after }
    );
    if (batch.length === 0) break;
    const ids = batch.map((e) => toInt(e.id));
    const lines = await select<any>(
      t,
      `SELECT * FROM journal_lines WHERE church_id = ? AND entry_id IN (${ids.map(() => '?').join(',')}) ORDER BY entry_id, line_no`,
      [churchId, ...ids]
    );
    const grouped = new Map<number, any[]>();
    for (const line of lines) {
      const list = grouped.get(toInt(line.entry_id)) ?? [];
      list.push(line);
      grouped.set(toInt(line.entry_id), list);
    }
    for (const entry of batch) {
      const entryNo = toInt(entry.entry_no);
      entries += 1;
      if (entryNo !== expected) issues.push(`entry numbering gap: expected ${expected}, found ${entryNo}`);
      expected = entryNo + 1;
      const own = (grouped.get(toInt(entry.id)) ?? []).map((l) => ({
        lineNo: toInt(l.line_no),
        accountId: toInt(l.account_id),
        fundId: toInt(l.fund_id),
        debit: toInt(l.debit_minor),
        credit: toInt(l.credit_minor),
        memberId: l.member_id === null ? null : toInt(l.member_id),
        ministryId: l.ministry_id === null ? null : toInt(l.ministry_id)
      }));
      lineCount += own.length;
      const debits = own.reduce((s, l) => s + l.debit, 0);
      const credits = own.reduce((s, l) => s + l.credit, 0);
      if (debits !== credits || debits !== toInt(entry.total_minor)) issues.push(`entry ${entryNo} does not balance`);
      if (String(entry.prev_hash).trim() !== prev) issues.push(`entry ${entryNo} does not link to the previous entry`);
      const recomputed = entryHash(prev, {
        churchId,
        entryNo,
        entryDate: dateOnly(entry.entry_date),
        sourceType: entry.source_type,
        sourceId: entry.source_id,
        memo: entry.memo,
        createdBy: entry.created_by === null ? null : toInt(entry.created_by),
        postedAt: iso(entry.posted_at),
        reverses: entry.reverses_entry_id === null ? null : toInt(entry.reverses_entry_id),
        lines: own
      });
      if (String(entry.hash).trim() !== recomputed) issues.push(`entry ${entryNo} has been altered`);
      prev = String(entry.hash).trim();
      after = entryNo;
    }
  }
  const head = await selectOne<any>(t, `SELECT next_entry_no, last_entry_hash FROM finance_chain WHERE church_id = :churchId`, { churchId });
  if (head && (toInt(head.next_entry_no) !== expected || String(head.last_entry_hash).trim() !== prev)) {
    issues.push('ledger chain head does not match the last entry (entries removed or added out of band)');
  }

  const recomputed = await select<any>(
    t,
    `SELECT period_id, account_id, fund_id, SUM(debit_minor) AS d, SUM(credit_minor) AS c
       FROM journal_lines WHERE church_id = :churchId GROUP BY period_id, account_id, fund_id`,
    { churchId }
  );
  const stored = await select<any>(t, `SELECT period_id, account_id, fund_id, debit_minor, credit_minor FROM ledger_balances WHERE church_id = :churchId`, { churchId });
  const key = (r: any) => `${toInt(r.period_id)}:${toInt(r.account_id)}:${toInt(r.fund_id)}`;
  const storedMap = new Map(stored.map((r) => [key(r), r]));
  for (const r of recomputed) {
    const s = storedMap.get(key(r));
    if (!s || toInt(s.debit_minor) !== toInt(r.d) || toInt(s.credit_minor) !== toInt(r.c)) {
      issues.push(`running balance differs from the journal for period/account/fund ${key(r)}`);
    }
    storedMap.delete(key(r));
  }
  for (const [k, s] of storedMap) {
    if (toInt(s.debit_minor) !== 0 || toInt(s.credit_minor) !== 0) issues.push(`running balance ${k} has no journal lines behind it`);
  }
  return { ok: issues.length === 0, entries, lines: lineCount, issues };
}

/** Rebuilds ledger_balances from the journal; the repair for a failed verifyLedger balance check. */
export async function rebuildBalances(t: Transaction, churchId: number): Promise<number> {
  await exec(t, `DELETE FROM ledger_balances WHERE church_id = :churchId`, { churchId });
  await exec(
    t,
    `INSERT INTO ledger_balances (church_id, period_id, account_id, fund_id, debit_minor, credit_minor)
     SELECT church_id, period_id, account_id, fund_id, SUM(debit_minor), SUM(credit_minor)
       FROM journal_lines WHERE church_id = :churchId GROUP BY church_id, period_id, account_id, fund_id`,
    { churchId }
  );
  const row = await selectOne<any>(t, `SELECT COUNT(*) AS n FROM ledger_balances WHERE church_id = :churchId`, { churchId });
  return toInt(row?.n);
}
