import { Transaction } from 'sequelize';
import { fromMinor, toInt } from '../../common/money';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { exec, execCount, select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';
import { dateOnly, sha256 } from '../finance/chain';
import { postEntry } from '../finance/ledger.service';
import { getBankAccount } from './accounts.service';
import type { StatementRow } from './csv';

export const MAX_IMPORT_ROWS = 5000;

export interface ImportInput {
  label?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  openingBalanceMinor?: number | null;
  closingBalanceMinor?: number | null;
  source: 'JSON' | 'CSV';
  rows: StatementRow[];
}

/**
 * Dedupe keys make re-importing an overlapping statement harmless. A bank reference (plus the
 * amount, since a charge can share its parent's reference) is the natural key; lines without a
 * reference fall back to a hash of date, amount and text, numbered within the file so two
 * genuinely identical lines on one day both survive.
 */
export function dedupeKeys(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.reference) return `ref:${row.reference.trim().toLowerCase()}:${row.amountMinor}`;
    const base = sha256(`${row.date}|${row.amountMinor}|${row.description.trim().toLowerCase()}`).slice(0, 40);
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);
    return `h:${base}:${nth}`;
  });
}

export async function importStatement(t: Transaction, churchId: number, actorId: number, bankAccountId: number, input: ImportInput) {
  await getBankAccount(t, churchId, bankAccountId);
  if (input.rows.length === 0) throw new BadRequestError('the statement has no transactions');
  if (input.rows.length > MAX_IMPORT_ROWS) throw new BadRequestError(`import at most ${MAX_IMPORT_ROWS} lines at a time`);
  for (const row of input.rows) {
    if (!Number.isSafeInteger(row.amountMinor) || row.amountMinor === 0) throw new BadRequestError('every line needs a non-zero amount');
  }
  const dates = input.rows.map((r) => r.date).sort();
  await exec(
    t,
    `INSERT INTO bank_statements (church_id, bank_account_id, label, period_start, period_end, opening_balance_minor, closing_balance_minor, source, imported_by)
     VALUES (:churchId, :bankAccountId, :label, :periodStart, :periodEnd, :opening, :closing, :source, :actorId)`,
    {
      churchId, bankAccountId, label: input.label ?? null, periodStart: input.periodStart ?? dates[0], periodEnd: input.periodEnd ?? dates[dates.length - 1],
      opening: input.openingBalanceMinor ?? null, closing: input.closingBalanceMinor ?? null, source: input.source, actorId
    }
  );
  const statement = await selectOne<any>(t, `SELECT id FROM bank_statements WHERE church_id = :churchId AND bank_account_id = :bankAccountId ORDER BY id DESC LIMIT 1`, { churchId, bankAccountId });
  const statementId = toInt(statement!.id);
  const keys = dedupeKeys(input.rows);
  let imported = 0;
  for (let i = 0; i < input.rows.length; i += 1) {
    const row = input.rows[i];
    imported += await execCount(
      t,
      `INSERT INTO bank_statement_lines (church_id, statement_id, bank_account_id, txn_date, description, reference, amount_minor, balance_minor, dedupe_key)
       VALUES (:churchId, :statementId, :bankAccountId, :date, :description, :reference, :amount, :balance, :key)
       ON CONFLICT (church_id, bank_account_id, dedupe_key) DO NOTHING`,
      { churchId, statementId, bankAccountId, date: row.date, description: row.description, reference: row.reference, amount: row.amountMinor, balance: row.balanceMinor, key: keys[i] }
    );
  }
  if (imported === 0) {
    await exec(t, `DELETE FROM bank_statements WHERE church_id = :churchId AND id = :statementId`, { churchId, statementId });
    return { statementId: null, imported: 0, skippedDuplicates: input.rows.length };
  }
  await exec(t, `UPDATE bank_statements SET line_count = :imported WHERE church_id = :churchId AND id = :statementId`, { imported, churchId, statementId });
  await recordAudit(t, churchId, { action: 'bank_statement.import', entityType: 'bank_statement', entityId: statementId, actorId, data: { bankAccountId, imported, skipped: input.rows.length - imported } });
  return { statementId, imported, skippedDuplicates: input.rows.length - imported };
}

export async function listStatements(t: Transaction, churchId: number, bankAccountId: number) {
  await getBankAccount(t, churchId, bankAccountId);
  const rows = await select<any>(t, `SELECT * FROM bank_statements WHERE church_id = :churchId AND bank_account_id = :bankAccountId ORDER BY id DESC`, { churchId, bankAccountId });
  return rows.map((r) => ({
    id: toInt(r.id), label: r.label, periodStart: r.period_start && dateOnly(r.period_start), periodEnd: r.period_end && dateOnly(r.period_end),
    openingBalance: r.opening_balance_minor === null ? null : fromMinor(r.opening_balance_minor),
    closingBalance: r.closing_balance_minor === null ? null : fromMinor(r.closing_balance_minor), source: r.source, lineCount: toInt(r.line_count), importedAt: r.imported_at
  }));
}

export function mapLine(r: any) {
  return {
    id: toInt(r.id), bankAccountId: toInt(r.bank_account_id), statementId: toInt(r.statement_id), date: dateOnly(r.txn_date), description: r.description, reference: r.reference,
    amount: fromMinor(r.amount_minor), amountMinor: toInt(r.amount_minor), status: r.status as 'UNMATCHED' | 'MATCHED' | 'IGNORED' | 'RECONCILED',
    ignoreReason: r.ignore_reason, reconciliationId: r.reconciliation_id === null ? null : toInt(r.reconciliation_id)
  };
}

export async function listLines(t: Transaction, churchId: number, bankAccountId: number, f: { status?: string; from?: string; to?: string; limit: number; cursor?: string }) {
  await getBankAccount(t, churchId, bankAccountId);
  const where = ['church_id = ?', 'bank_account_id = ?'];
  const params: unknown[] = [churchId, bankAccountId];
  if (f.status) { where.push('status = ?'); params.push(f.status); }
  if (f.from) { where.push('txn_date >= ?'); params.push(f.from); }
  if (f.to) { where.push('txn_date <= ?'); params.push(f.to); }
  const cursor = decodeCursor<{ d: string; id: number }>(f.cursor);
  if (cursor) { where.push('(txn_date < ? OR (txn_date = ? AND id < ?))'); params.push(cursor.d, cursor.d, cursor.id); }
  const rows = await select<any>(t, `SELECT * FROM bank_statement_lines WHERE ${where.join(' AND ')} ORDER BY txn_date DESC, id DESC LIMIT ?`, [...params, f.limit + 1]);
  return toKeysetPage(rows.map(mapLine), f.limit, (l) => ({ d: l.date, id: l.id }));
}

export async function getLine(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `SELECT * FROM bank_statement_lines WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`statement line ${id} was not found`);
  return row;
}

// ---- ledger side -----------------------------------------------------------------------------

/**
 * Ledger lines on a bank account's GL account that are not yet cleared against a statement. Both
 * halves of a reversed entry are left out: they net to zero and would only be noise.
 */
export async function unmatchedLedgerLines(t: Transaction, churchId: number, glAccountId: number, f: { asOf?: string; from?: string; amountMinor?: number; limit?: number } = {}) {
  const where = [
    'l.church_id = ?', 'l.account_id = ?', 'm.id IS NULL', 'e.reversed_by_entry_id IS NULL', 'e.reverses_entry_id IS NULL'
  ];
  const params: unknown[] = [churchId, glAccountId];
  if (f.asOf) { where.push('l.entry_date <= ?'); params.push(f.asOf); }
  if (f.from) { where.push('l.entry_date >= ?'); params.push(f.from); }
  if (f.amountMinor !== undefined) { where.push('(l.debit_minor - l.credit_minor) = ?'); params.push(f.amountMinor); }
  const rows = await select<any>(
    t,
    `SELECT l.id, l.entry_id, l.entry_date, l.debit_minor, l.credit_minor, l.memo AS line_memo, e.entry_no, e.memo, e.source_type, e.source_id
       FROM journal_lines l
       JOIN journal_entries e ON e.church_id = l.church_id AND e.id = l.entry_id
       LEFT JOIN bank_matches m ON m.church_id = l.church_id AND m.journal_line_id = l.id
      WHERE ${where.join(' AND ')} ORDER BY l.entry_date, l.id LIMIT ?`,
    [...params, f.limit ?? 500]
  );
  return rows.map((r) => ({
    journalLineId: toInt(r.id), entryId: toInt(r.entry_id), entryNo: toInt(r.entry_no), date: dateOnly(r.entry_date), memo: r.line_memo || r.memo,
    sourceType: r.source_type as string, sourceId: r.source_id as string | null, amountMinor: toInt(r.debit_minor) - toInt(r.credit_minor), amount: fromMinor(toInt(r.debit_minor) - toInt(r.credit_minor))
  }));
}

function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function score(line: { date: string; reference: string | null; description: string }, candidate: { date: string; memo: string; entryNo: number; sourceId: string | null }): number {
  let s = 100 - daysBetween(line.date, candidate.date) * 5;
  const ref = line.reference?.trim().toLowerCase();
  if (ref) {
    if (candidate.memo?.toLowerCase().includes(ref) || candidate.sourceId?.toLowerCase() === ref || String(candidate.entryNo) === ref) s += 100;
  }
  return s;
}

export async function candidatesFor(t: Transaction, churchId: number, lineId: number, windowDays = 7) {
  const line = mapLine(await getLine(t, churchId, lineId));
  const bank = await getBankAccount(t, churchId, line.bankAccountId);
  const found = await unmatchedLedgerLines(t, churchId, bank.glAccountId, { from: addDays(line.date, -windowDays), asOf: addDays(line.date, windowDays), amountMinor: line.amountMinor });
  return found.map((c) => ({ ...c, score: score(line, c) })).sort((a, b) => b.score - a.score);
}

export async function matchLine(t: Transaction, churchId: number, actorId: number, lineId: number, journalLineIds: number[]) {
  const line = mapLine(await getLine(t, churchId, lineId));
  if (line.status === 'RECONCILED') throw new ConflictError('that line is part of a finalized reconciliation');
  if (line.status !== 'UNMATCHED') throw new ConflictError(`the line is already ${line.status.toLowerCase()}; undo that first`);
  const ids = [...new Set(journalLineIds)];
  if (ids.length === 0) throw new BadRequestError('choose at least one ledger line');
  const bank = await getBankAccount(t, churchId, line.bankAccountId);
  const rows = await select<any>(
    t,
    `SELECT l.id, l.account_id, l.debit_minor, l.credit_minor, e.reversed_by_entry_id, e.reverses_entry_id
       FROM journal_lines l JOIN journal_entries e ON e.church_id = l.church_id AND e.id = l.entry_id
      WHERE l.church_id = ? AND l.id IN (${ids.map(() => '?').join(',')})`,
    [churchId, ...ids]
  );
  if (rows.length !== ids.length) throw new BadRequestError('a chosen ledger line does not exist in this church');
  let total = 0;
  for (const r of rows) {
    if (toInt(r.account_id) !== bank.glAccountId) throw new BadRequestError('a chosen ledger line belongs to a different account');
    if (r.reversed_by_entry_id !== null || r.reverses_entry_id !== null) throw new BadRequestError('a chosen ledger line belongs to a reversed entry');
    total += toInt(r.debit_minor) - toInt(r.credit_minor);
  }
  if (total !== line.amountMinor) throw new BadRequestError(`the chosen ledger lines total ${fromMinor(total)} but the statement line is ${fromMinor(line.amountMinor)}`);
  for (const r of rows) {
    const inserted = await execCount(
      t,
      `INSERT INTO bank_matches (church_id, statement_line_id, journal_line_id, amount_minor, matched_by) VALUES (:churchId, :lineId, :jl, :amount, :actorId)
       ON CONFLICT (church_id, journal_line_id) DO NOTHING`,
      { churchId, lineId, jl: toInt(r.id), amount: toInt(r.debit_minor) - toInt(r.credit_minor), actorId }
    );
    if (inserted !== 1) throw new ConflictError('a chosen ledger line was matched to another statement line at the same moment');
  }
  await exec(t, `UPDATE bank_statement_lines SET status = 'MATCHED' WHERE church_id = :churchId AND id = :lineId`, { churchId, lineId });
  return mapLine(await getLine(t, churchId, lineId));
}

export async function unmatchLine(t: Transaction, churchId: number, lineId: number) {
  const line = mapLine(await getLine(t, churchId, lineId));
  if (line.status === 'RECONCILED') throw new ConflictError('that line is part of a finalized reconciliation and cannot change');
  if (line.status !== 'MATCHED') throw new ConflictError('the line is not matched');
  await exec(t, `DELETE FROM bank_matches WHERE church_id = :churchId AND statement_line_id = :lineId`, { churchId, lineId });
  await exec(t, `UPDATE bank_statement_lines SET status = 'UNMATCHED' WHERE church_id = :churchId AND id = :lineId`, { churchId, lineId });
  return mapLine(await getLine(t, churchId, lineId));
}

export async function ignoreLine(t: Transaction, churchId: number, lineId: number, reason: string) {
  const line = mapLine(await getLine(t, churchId, lineId));
  if (line.status !== 'UNMATCHED') throw new ConflictError(line.status === 'RECONCILED' ? 'that line is part of a finalized reconciliation' : 'only an unmatched line can be ignored');
  await exec(t, `UPDATE bank_statement_lines SET status = 'IGNORED', ignore_reason = :reason WHERE church_id = :churchId AND id = :lineId`, { reason, churchId, lineId });
  return mapLine(await getLine(t, churchId, lineId));
}

export async function unignoreLine(t: Transaction, churchId: number, lineId: number) {
  const line = mapLine(await getLine(t, churchId, lineId));
  if (line.status === 'RECONCILED' || (line.status === 'IGNORED' && line.reconciliationId)) throw new ConflictError('that line is part of a finalized reconciliation');
  if (line.status !== 'IGNORED') throw new ConflictError('the line is not ignored');
  await exec(t, `UPDATE bank_statement_lines SET status = 'UNMATCHED', ignore_reason = NULL WHERE church_id = :churchId AND id = :lineId`, { churchId, lineId });
  return mapLine(await getLine(t, churchId, lineId));
}

export interface Proposal {
  lineId: number;
  journalLineId: number;
  score: number;
  unique: boolean;
  applied: boolean;
}

/**
 * Proposes (and optionally applies) one-to-one matches: same amount, within a date window. A
 * proposal is only applied when it is unambiguous: the sole candidate, or one whose bank
 * reference shows up in the ledger memo or source. Each ledger line is offered once.
 */
export async function autoMatch(t: Transaction, churchId: number, actorId: number, bankAccountId: number, options: { apply: boolean; windowDays?: number; limit?: number }) {
  const bank = await getBankAccount(t, churchId, bankAccountId);
  const window = options.windowDays ?? 5;
  const lines = (
    await select<any>(t, `SELECT * FROM bank_statement_lines WHERE church_id = :churchId AND bank_account_id = :bankAccountId AND status = 'UNMATCHED' ORDER BY txn_date, id LIMIT :limit`, {
      churchId, bankAccountId, limit: options.limit ?? 500
    })
  ).map(mapLine);
  if (lines.length === 0) return { proposals: [] as Proposal[], applied: 0 };
  const dates = lines.map((l) => l.date).sort();
  const ledger = await unmatchedLedgerLines(t, churchId, bank.glAccountId, { from: addDays(dates[0], -window), asOf: addDays(dates[dates.length - 1], window), limit: 5000 });
  const claimed = new Set<number>();
  const proposals: Proposal[] = [];
  const full = lines.map((l) => ({ ...l, reference: l.reference as string | null }));
  for (const line of full) {
    const cands = ledger
      .filter((c) => !claimed.has(c.journalLineId) && c.amountMinor === line.amountMinor && daysBetween(line.date, c.date) <= window)
      .map((c) => ({ c, s: score(line, c) }))
      .sort((a, b) => b.s - a.s);
    if (cands.length === 0) continue;
    const best = cands[0];
    const referenceHit = best.s >= 200 - window * 5 && Boolean(line.reference);
    const unique = cands.length === 1 || (referenceHit && (cands.length === 1 || best.s > cands[1].s));
    claimed.add(best.c.journalLineId);
    proposals.push({ lineId: line.id, journalLineId: best.c.journalLineId, score: best.s, unique, applied: false });
  }
  let applied = 0;
  if (options.apply) {
    for (const p of proposals) {
      if (!p.unique) continue;
      await matchLine(t, churchId, actorId, p.lineId, [p.journalLineId]);
      p.applied = true;
      applied += 1;
    }
    if (applied > 0) await recordAudit(t, churchId, { action: 'bank.auto_match', entityType: 'bank_account', entityId: bankAccountId, actorId, data: { applied } });
  }
  return { proposals, applied };
}

/** Books a bank-only item (a charge, interest, a direct deposit) and matches it in one step. */
export async function createEntryFromLine(
  t: Transaction,
  churchId: number,
  actorId: number,
  lineId: number,
  input: { accountId: number; fundId: number; memo?: string | null; ministryId?: number | null }
) {
  const line = mapLine(await getLine(t, churchId, lineId));
  if (line.status !== 'UNMATCHED') throw new ConflictError(`the line is already ${line.status.toLowerCase()}`);
  const bank = await getBankAccount(t, churchId, line.bankAccountId);
  if (input.accountId === bank.glAccountId) throw new BadRequestError('choose the account the money was for, not the bank account itself');
  const abs = Math.abs(line.amountMinor);
  const memo = (input.memo?.trim() || line.description || `Bank line ${line.id}`).slice(0, 500);
  const posted = await postEntry(
    {
      entryDate: line.date, memo, sourceType: 'BANK', sourceId: line.id, actorId, idempotencyKey: `bankline:${line.id}`,
      lines:
        line.amountMinor < 0
          ? [{ accountId: input.accountId, fundId: input.fundId, debit: abs, ministryId: input.ministryId }, { accountId: bank.glAccountId, fundId: input.fundId, credit: abs }]
          : [{ accountId: bank.glAccountId, fundId: input.fundId, debit: abs }, { accountId: input.accountId, fundId: input.fundId, credit: abs, ministryId: input.ministryId }]
    },
    t,
    churchId
  );
  const journalLine = await selectOne<any>(t, `SELECT id FROM journal_lines WHERE church_id = :churchId AND entry_id = :entryId AND account_id = :gl`, { churchId, entryId: posted.id, gl: bank.glAccountId });
  await matchLine(t, churchId, actorId, lineId, [toInt(journalLine!.id)]);
  await recordAudit(t, churchId, { action: 'bank.create_entry', entityType: 'bank_statement_line', entityId: lineId, actorId, data: { entryId: posted.id } });
  return { entryId: posted.id, entryNo: posted.entryNo, line: mapLine(await getLine(t, churchId, lineId)) };
}

/** Everything on either side that has not cleared yet, and what it adds up to. */
export async function unreconciledReport(t: Transaction, churchId: number, bankAccountId: number, asOf?: string) {
  const bank = await getBankAccount(t, churchId, bankAccountId);
  const statementLines = (
    await select<any>(t, `SELECT * FROM bank_statement_lines WHERE church_id = ? AND bank_account_id = ? AND status = 'UNMATCHED' ${asOf ? 'AND txn_date <= ?' : ''} ORDER BY txn_date, id`, asOf ? [churchId, bankAccountId, asOf] : [churchId, bankAccountId])
  ).map(mapLine);
  const ledgerLines = await unmatchedLedgerLines(t, churchId, bank.glAccountId, { asOf, limit: 5000 });
  const bankTotal = statementLines.reduce((s, l) => s + l.amountMinor, 0);
  const ledgerTotal = ledgerLines.reduce((s, l) => s + l.amountMinor, 0);
  return {
    bankAccount: bank,
    statementLines,
    ledgerLines,
    totals: { bankOnly: fromMinor(bankTotal), ledgerOnly: fromMinor(ledgerTotal), net: fromMinor(ledgerTotal - bankTotal) }
  };
}
