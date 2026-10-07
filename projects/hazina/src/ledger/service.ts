/**
 * The ledger: the only place money moves. Every product feature (a deposit, a disbursement, a repayment, a penalty, a
 * write-off) ends in postEntry, and a manual journal is the same call. The database refuses an unbalanced or
 * incomplete entry and refuses to edit one afterwards (see migration 0003); this module adds the rules a database cannot
 * know: accounts exist and are active, amounts are whole positive cents, and a closed-looking date is a real date.
 */
import { PoolClient } from 'pg';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { AccountType, LATE_SYSTEM_ACCOUNTS, debitNormal } from './chart';

export interface PostLine {
  accountCode: string;
  debitCents?: number;
  creditCents?: number;
  memberId?: string | null;
  loanId?: string | null;
}

export interface PostInput {
  entryDate: string;
  memo: string;
  sourceType: string;
  sourceId?: string | null;
  postedBy: string | null;
  reverses?: string | null;
  lines: PostLine[];
}

export interface Posted {
  id: string;
  seq: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Checks everything a database cannot know about one entry and returns its totals. */
function validate(input: PostInput): number {
  if (!DAY.test(input.entryDate)) throw new BadRequestError('The entry date must be YYYY-MM-DD.');
  if (!input.memo.trim()) throw new BadRequestError('A journal entry needs a memo.');
  if (input.lines.length < 2) throw new BadRequestError('A journal entry needs at least two lines.');

  let debits = 0;
  let credits = 0;
  for (const line of input.lines) {
    const d = line.debitCents ?? 0;
    const c = line.creditCents ?? 0;
    if (!Number.isInteger(d) || !Number.isInteger(c) || d < 0 || c < 0) throw new BadRequestError('Amounts are whole, non-negative cents.');
    if ((d > 0) === (c > 0)) throw new BadRequestError('Each line is either a debit or a credit, not both and not neither.');
    debits += d;
    credits += c;
  }
  if (debits !== credits) throw new BadRequestError(`The entry does not balance: debits ${debits}, credits ${credits}.`);
  return debits;
}

/** The last day of the closed period, or null when nothing is closed. */
export async function lockedThrough(client: PoolClient): Promise<string | null> {
  const { rows } = await client.query(`SELECT to_char(locked_through, 'YYYY-MM-DD') AS d FROM period_locks LIMIT 1`);
  return (rows[0]?.d as string | undefined) ?? null;
}

/**
 * The date a SYSTEM posting (money received, interest accrued, a penalty) takes: the day it belongs to, or the first open day
 * when that day is in a closed period. Money that has arrived must be booked, so these postings move forward rather than fail.
 */
export async function postingDateFor(client: PoolClient, day: string): Promise<string> {
  const locked = await lockedThrough(client);
  if (!locked || day > locked) return day;
  return (await client.query(`SELECT to_char($1::date + 1, 'YYYY-MM-DD') AS d`, [locked])).rows[0].d as string;
}

async function assertOpen(client: PoolClient, dates: string[]): Promise<void> {
  const locked = await lockedThrough(client);
  if (!locked) return;
  const bad = dates.find((d) => d <= locked);
  if (bad) throw new ConflictError(`The period through ${locked} is closed; an entry dated ${bad} cannot be posted. Date it after ${locked}, or ask an owner to reopen the period.`);
}

/** Resolves account codes to ids, creating a system account added after the organisation existed on first use. */
async function resolveAccounts(client: PoolClient, orgId: string, codes: string[]): Promise<Map<string, string>> {
  const load = async () => {
    const found = await client.query('SELECT id, code, active FROM accounts WHERE code = ANY($1::text[])', [codes]);
    return new Map<string, { id: string; active: boolean }>(found.rows.map((r) => [r.code as string, { id: r.id as string, active: r.active as boolean }]));
  };
  let byCode = await load();
  const missing = codes.filter((c) => !byCode.has(c));
  const late = LATE_SYSTEM_ACCOUNTS.filter((a) => missing.includes(a.code));
  if (late.length > 0) {
    for (const a of late) {
      await client.query('INSERT INTO accounts (org_id, code, name, type, is_system) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (org_id, code) DO NOTHING', [orgId, a.code, a.name, a.type, a.system]);
    }
    byCode = await load();
  }
  const ids = new Map<string, string>();
  for (const code of codes) {
    const account = byCode.get(code);
    if (!account) throw new NotFoundError(`There is no account ${code} in this organisation.`);
    if (!account.active) throw new ConflictError(`Account ${code} is switched off.`);
    ids.set(code, account.id);
  }
  return ids;
}

export async function postEntry(client: PoolClient, orgId: string, input: PostInput): Promise<Posted> {
  return (await postEntries(client, orgId, [input]))[0]!;
}

/**
 * Posts many entries with a handful of statements. The numbering counter is bumped once, at the end, by the whole batch, so
 * the one row every posting in the organisation queues on is held for milliseconds however large the batch: numbers stay
 * gap-free (a rolled-back batch gives all of them back) without a batch job stalling repayments.
 */
export async function postEntries(client: PoolClient, orgId: string, inputs: PostInput[]): Promise<Posted[]> {
  if (inputs.length === 0) return [];
  const totals = inputs.map(validate);
  const codes = [...new Set(inputs.flatMap((i) => i.lines.map((l) => l.accountCode)))];
  const ids = await resolveAccounts(client, orgId, codes);

  // The counter row is locked until this transaction ends, so two postings cannot take the same number and a rolled-back
  // posting gives its number back: entry numbers per organisation have no gaps.
  const counter = await client.query(
    `INSERT INTO org_counters (org_id, name, value) VALUES ($1, 'journal', $2)
     ON CONFLICT (org_id, name) DO UPDATE SET value = org_counters.value + $2 RETURNING value`,
    [orgId, inputs.length]
  );
  const last = Number(counter.rows[0].value);
  const first = last - inputs.length + 1;
  // Read AFTER taking the counter lock: closing a period takes the same lock, so a posting is either committed before the
  // period closes (and is in its snapshot) or sees the closed period here and is refused.
  await assertOpen(client, [...new Set(inputs.map((i) => i.entryDate))]);

  const entryIds = (await client.query(
    `INSERT INTO journal_entries (org_id, seq, entry_date, memo, source_type, source_id, line_count, total_cents, posted_by, reverses)
     SELECT $1, t.seq, t.entry_date::date, t.memo, t.source_type, t.source_id, t.line_count, t.total_cents, t.posted_by, t.reverses
       FROM unnest($2::bigint[], $3::text[], $4::text[], $5::text[], $6::uuid[], $7::int[], $8::bigint[], $9::uuid[], $10::uuid[])
            AS t(seq, entry_date, memo, source_type, source_id, line_count, total_cents, posted_by, reverses)
      RETURNING id, seq`,
    [
      orgId,
      inputs.map((_, i) => first + i), inputs.map((i) => i.entryDate), inputs.map((i) => i.memo.trim()), inputs.map((i) => i.sourceType),
      inputs.map((i) => i.sourceId ?? null), inputs.map((i) => i.lines.length), totals, inputs.map((i) => i.postedBy), inputs.map((i) => i.reverses ?? null)
    ]
  )).rows.sort((a, b) => Number(a.seq) - Number(b.seq));

  const lineEntry: string[] = [];
  const lineNo: number[] = [];
  const lineAccount: string[] = [];
  const lineMember: Array<string | null> = [];
  const lineLoan: Array<string | null> = [];
  const lineDebit: number[] = [];
  const lineCredit: number[] = [];
  inputs.forEach((input, i) => {
    input.lines.forEach((line, k) => {
      lineEntry.push(entryIds[i].id as string);
      lineNo.push(k + 1);
      lineAccount.push(ids.get(line.accountCode)!);
      lineMember.push(line.memberId ?? null);
      lineLoan.push(line.loanId ?? null);
      lineDebit.push(line.debitCents ?? 0);
      lineCredit.push(line.creditCents ?? 0);
    });
  });
  await client.query(
    `INSERT INTO journal_lines (org_id, entry_id, line_no, account_id, member_id, loan_id, debit_cents, credit_cents)
     SELECT $1, t.entry_id, t.line_no, t.account_id, t.member_id, t.loan_id, t.debit_cents, t.credit_cents
       FROM unnest($2::uuid[], $3::int[], $4::uuid[], $5::uuid[], $6::uuid[], $7::bigint[], $8::bigint[])
            AS t(entry_id, line_no, account_id, member_id, loan_id, debit_cents, credit_cents)`,
    [orgId, lineEntry, lineNo, lineAccount, lineMember, lineLoan, lineDebit, lineCredit]
  );
  return entryIds.map((r) => ({ id: r.id as string, seq: Number(r.seq) }));
}

/** Cancels an entry by posting its mirror image. Only an entry that was not already reversed, and not itself a reversal. */
export async function reverseEntry(client: PoolClient, orgId: string, entryId: string, postedBy: string | null, memo: string, entryDate: string): Promise<Posted> {
  const original = (await client.query('SELECT id, memo, source_type, reverses, seq FROM journal_entries WHERE id = $1', [entryId])).rows[0];
  if (!original) throw new NotFoundError('That journal entry was not found.');
  if (original.reverses) throw new ConflictError('A reversal cannot itself be reversed; post a new entry instead.');
  const lines = (await client.query(
    `SELECT a.code, l.debit_cents, l.credit_cents, l.member_id, l.loan_id FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = $1 ORDER BY l.line_no`,
    [entryId]
  )).rows;
  return postEntry(client, orgId, {
    entryDate,
    memo: `Reversal of entry ${original.seq}: ${memo}`,
    sourceType: 'reversal',
    sourceId: entryId,
    postedBy,
    reverses: entryId,
    lines: lines.map((l) => ({ accountCode: l.code as string, debitCents: Number(l.credit_cents), creditCents: Number(l.debit_cents), memberId: l.member_id, loanId: l.loan_id }))
  });
}

/**
 * The debits and credits of every account up to a date, as the latest snapshot at or before it plus the lines after it
 * (see ledger_snapshots): bounded by the length of one period, not by the age of the ledger. Columns: account_id, dr, cr.
 */
const BALANCES_SQL = `
  WITH base AS (SELECT max(as_of) AS d FROM ledger_snapshots WHERE as_of <= $1::date),
  parts AS (
    SELECT s.account_id, s.debit_cents AS dr, s.credit_cents AS cr FROM ledger_snapshots s, base WHERE s.as_of = base.d
    UNION ALL
    SELECT l.account_id, l.debit_cents, l.credit_cents
      FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id, base
     WHERE e.entry_date <= $1::date AND (base.d IS NULL OR e.entry_date > base.d)
  )`;

/** Net balance in the account's normal direction (a positive liability balance is money owed). */
export async function accountBalance(client: PoolClient, code: string, asOf?: string): Promise<number> {
  const { rows } = await client.query(
    `${BALANCES_SQL}
     SELECT a.type, COALESCE(sum(p.dr), 0)::bigint AS dr, COALESCE(sum(p.cr), 0)::bigint AS cr
       FROM accounts a LEFT JOIN parts p ON p.account_id = a.id WHERE a.code = $2 GROUP BY a.type`,
    [asOf ?? 'infinity', code]
  );
  if (!rows[0]) return 0;
  const dr = Number(rows[0].dr);
  const cr = Number(rows[0].cr);
  return debitNormal(rows[0].type as AccountType) ? dr - cr : cr - dr;
}

/** A member's balance in one account: their savings, their shares, what they owe. */
export async function memberBalance(client: PoolClient, memberId: string, code: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT a.type, COALESCE(sum(l.debit_cents), 0)::bigint AS dr, COALESCE(sum(l.credit_cents), 0)::bigint AS cr
       FROM accounts a JOIN journal_lines l ON l.account_id = a.id AND l.member_id = $2
      WHERE a.code = $1 GROUP BY a.type`,
    [code, memberId]
  );
  if (!rows[0]) return 0;
  const dr = Number(rows[0].dr);
  const cr = Number(rows[0].cr);
  return debitNormal(rows[0].type as AccountType) ? dr - cr : cr - dr;
}

export interface TrialRow {
  code: string;
  name: string;
  type: AccountType;
  debitCents: number;
  creditCents: number;
}

/** Every account's balance as at a date, shown on its normal side. Debits equal credits, always. */
export async function trialBalance(client: PoolClient, asOf: string): Promise<{ rows: TrialRow[]; totalDebitCents: number; totalCreditCents: number }> {
  const { rows } = await client.query(
    `${BALANCES_SQL}
     SELECT a.code, a.name, a.type, COALESCE(sum(p.dr), 0)::bigint AS dr, COALESCE(sum(p.cr), 0)::bigint AS cr
       FROM accounts a LEFT JOIN parts p ON p.account_id = a.id GROUP BY a.code, a.name, a.type ORDER BY a.code`,
    [asOf]
  );
  const out: TrialRow[] = [];
  let totalDr = 0;
  let totalCr = 0;
  for (const r of rows) {
    const net = Number(r.dr) - Number(r.cr);
    if (Number(r.dr) === 0 && Number(r.cr) === 0) continue;
    const row: TrialRow = { code: r.code, name: r.name, type: r.type, debitCents: net > 0 ? net : 0, creditCents: net < 0 ? -net : 0 };
    totalDr += row.debitCents;
    totalCr += row.creditCents;
    out.push(row);
  }
  return { rows: out, totalDebitCents: totalDr, totalCreditCents: totalCr };
}

export interface StatementLine {
  code: string;
  name: string;
  amountCents: number;
}

/** Income less expenses for a period. */
export async function incomeStatement(client: PoolClient, from: string, to: string) {
  const { rows } = await client.query(
    `SELECT a.code, a.name, a.type, COALESCE(sum(l.debit_cents), 0)::bigint AS dr, COALESCE(sum(l.credit_cents), 0)::bigint AS cr
       FROM accounts a
       JOIN journal_lines l ON l.account_id = a.id
       JOIN journal_entries e ON e.id = l.entry_id AND e.entry_date BETWEEN $1::date AND $2::date
      WHERE a.type IN ('income', 'expense') GROUP BY a.code, a.name, a.type ORDER BY a.code`,
    [from, to]
  );
  const income: StatementLine[] = [];
  const expenses: StatementLine[] = [];
  for (const r of rows) {
    const amount = r.type === 'income' ? Number(r.cr) - Number(r.dr) : Number(r.dr) - Number(r.cr);
    (r.type === 'income' ? income : expenses).push({ code: r.code, name: r.name, amountCents: amount });
  }
  const totalIncome = income.reduce((s, l) => s + l.amountCents, 0);
  const totalExpenses = expenses.reduce((s, l) => s + l.amountCents, 0);
  return { from, to, income, expenses, totalIncomeCents: totalIncome, totalExpensesCents: totalExpenses, surplusCents: totalIncome - totalExpenses };
}

/**
 * Assets = liabilities + equity + the surplus not yet moved to accumulated surplus. Income and expense accounts are
 * never closed in the ledger; the balance sheet adds their running net as "surplus to date", so it balances at any date.
 */
export async function balanceSheet(client: PoolClient, asOf: string) {
  const tb = await trialBalance(client, asOf);
  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];
  let incomeNet = 0;
  for (const r of tb.rows) {
    const net = r.debitCents - r.creditCents;
    if (r.type === 'asset') assets.push({ code: r.code, name: r.name, amountCents: net });
    else if (r.type === 'liability') liabilities.push({ code: r.code, name: r.name, amountCents: -net });
    else if (r.type === 'equity') equity.push({ code: r.code, name: r.name, amountCents: -net });
    else incomeNet += -net; // income is credit-normal (negative net), expense debit-normal
  }
  const sum = (lines: StatementLine[]) => lines.reduce((s, l) => s + l.amountCents, 0);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity) + incomeNet;
  return {
    asOf,
    assets,
    liabilities,
    equity,
    surplusToDateCents: incomeNet,
    totalAssetsCents: totalAssets,
    totalLiabilitiesCents: totalLiabilities,
    totalEquityCents: totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity
  };
}
