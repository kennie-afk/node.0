import { Transaction } from 'sequelize';
import { fromMinor, toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { exec, select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';
import { dateOnly } from '../finance/chain';
import { getBankAccount } from './accounts.service';

interface RecRow {
  id: number;
  bankAccountId: number;
  statementDate: string;
  statementBalance: number;
  openingBalance: number;
  status: 'OPEN' | 'FINALIZED';
  clearedBalance: number | null;
  difference: number | null;
  finalizedAt: unknown;
}

function map(r: any): RecRow {
  return {
    id: toInt(r.id),
    bankAccountId: toInt(r.bank_account_id),
    statementDate: dateOnly(r.statement_date),
    statementBalance: toInt(r.statement_balance_minor),
    openingBalance: toInt(r.opening_balance_minor),
    status: r.status,
    clearedBalance: r.cleared_balance_minor === null ? null : toInt(r.cleared_balance_minor),
    difference: r.difference_minor === null ? null : toInt(r.difference_minor),
    finalizedAt: r.finalized_at
  };
}

async function getRec(t: Transaction, churchId: number, id: number): Promise<RecRow> {
  const row = await selectOne<any>(t, `SELECT * FROM reconciliations WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`reconciliation ${id} was not found`);
  return map(row);
}

const dto = (r: RecRow) => ({
  id: r.id,
  bankAccountId: r.bankAccountId,
  statementDate: r.statementDate,
  statementBalance: fromMinor(r.statementBalance),
  openingBalance: fromMinor(r.openingBalance),
  status: r.status,
  clearedBalance: r.clearedBalance === null ? null : fromMinor(r.clearedBalance),
  difference: r.difference === null ? null : fromMinor(r.difference),
  finalizedAt: r.finalizedAt
});

/**
 * The arithmetic. Starting from the last reconciled balance (or the opening balance the first
 * time), add the ledger amount of every matched statement line up to the statement date, plus any
 * ignored bank items, and compare with the closing balance on the statement. Finalising demands
 * a difference of exactly zero and no unmatched bank lines left.
 */
export async function summarize(t: Transaction, churchId: number, rec: RecRow) {
  const previous = await selectOne<any>(
    t,
    `SELECT cleared_balance_minor FROM reconciliations WHERE church_id = :churchId AND bank_account_id = :bankAccountId AND status = 'FINALIZED' AND statement_date < :date ORDER BY statement_date DESC LIMIT 1`,
    { churchId, bankAccountId: rec.bankAccountId, date: rec.statementDate }
  );
  const startingBalance = previous ? toInt(previous.cleared_balance_minor) : rec.openingBalance;
  const base = `church_id = :churchId AND bank_account_id = :bankAccountId AND txn_date <= :date AND reconciliation_id IS NULL`;
  const params = { churchId, bankAccountId: rec.bankAccountId, date: rec.statementDate };
  const unmatched = await select<any>(t, `SELECT id, txn_date, description, amount_minor FROM bank_statement_lines WHERE ${base} AND status = 'UNMATCHED' ORDER BY txn_date, id`, params);
  const ledger = await selectOne<any>(
    t,
    `SELECT COALESCE(SUM(m.amount_minor), 0) AS total, COUNT(*) AS n FROM bank_matches m
       JOIN bank_statement_lines s ON s.church_id = m.church_id AND s.id = m.statement_line_id
      WHERE s.church_id = :churchId AND s.bank_account_id = :bankAccountId AND s.txn_date <= :date AND s.reconciliation_id IS NULL AND s.status = 'MATCHED'`,
    params
  );
  const ignored = await selectOne<any>(t, `SELECT COALESCE(SUM(amount_minor), 0) AS total, COUNT(*) AS n FROM bank_statement_lines WHERE ${base} AND status = 'IGNORED'`, params);
  const matchedLedger = toInt(ledger?.total);
  const ignoredTotal = toInt(ignored?.total);
  const cleared = startingBalance + matchedLedger + ignoredTotal;
  const difference = rec.statementBalance - cleared;
  return {
    startingBalance,
    matchedLedgerTotal: matchedLedger,
    ignoredTotal,
    clearedBalance: cleared,
    statementBalance: rec.statementBalance,
    difference,
    unmatchedStatementLines: unmatched.map((l) => ({ id: toInt(l.id), date: dateOnly(l.txn_date), description: l.description, amount: fromMinor(l.amount_minor) })),
    canFinalize: unmatched.length === 0 && difference === 0
  };
}

function summaryDto(s: Awaited<ReturnType<typeof summarize>>) {
  return {
    startingBalance: fromMinor(s.startingBalance),
    matchedLedgerTotal: fromMinor(s.matchedLedgerTotal),
    ignoredTotal: fromMinor(s.ignoredTotal),
    clearedBalance: fromMinor(s.clearedBalance),
    statementBalance: fromMinor(s.statementBalance),
    difference: fromMinor(s.difference),
    unmatchedStatementLines: s.unmatchedStatementLines,
    canFinalize: s.canFinalize
  };
}

export async function openReconciliation(
  t: Transaction,
  churchId: number,
  actorId: number,
  bankAccountId: number,
  input: { statementDate: string; statementBalanceMinor: number; openingBalanceMinor?: number }
) {
  await getBankAccount(t, churchId, bankAccountId);
  if (await selectOne(t, `SELECT id FROM reconciliations WHERE church_id = :churchId AND bank_account_id = :bankAccountId AND status = 'OPEN'`, { churchId, bankAccountId })) {
    throw new ConflictError('there is already an open reconciliation for this account; finalize or delete it first');
  }
  const last = await selectOne<any>(t, `SELECT statement_date FROM reconciliations WHERE church_id = :churchId AND bank_account_id = :bankAccountId AND status = 'FINALIZED' ORDER BY statement_date DESC LIMIT 1`, { churchId, bankAccountId });
  if (last && dateOnly(last.statement_date) >= input.statementDate) {
    throw new ConflictError(`the account is already reconciled up to ${dateOnly(last.statement_date)}`);
  }
  if (!last && input.openingBalanceMinor === undefined) {
    throw new BadRequestError('the first reconciliation of an account needs the statement opening balance');
  }
  await exec(
    t,
    `INSERT INTO reconciliations (church_id, bank_account_id, statement_date, statement_balance_minor, opening_balance_minor, created_by)
     VALUES (:churchId, :bankAccountId, :date, :balance, :opening, :actorId)`,
    { churchId, bankAccountId, date: input.statementDate, balance: input.statementBalanceMinor, opening: last ? 0 : input.openingBalanceMinor ?? 0, actorId }
  );
  const row = await selectOne<any>(t, `SELECT * FROM reconciliations WHERE church_id = :churchId AND bank_account_id = :bankAccountId AND status = 'OPEN'`, { churchId, bankAccountId });
  const rec = map(row);
  return { ...dto(rec), summary: summaryDto(await summarize(t, churchId, rec)) };
}

export async function getReconciliation(t: Transaction, churchId: number, id: number) {
  const rec = await getRec(t, churchId, id);
  if (rec.status === 'FINALIZED') return dto(rec);
  return { ...dto(rec), summary: summaryDto(await summarize(t, churchId, rec)) };
}

export async function listReconciliations(t: Transaction, churchId: number, bankAccountId: number) {
  await getBankAccount(t, churchId, bankAccountId);
  const rows = await select<any>(t, `SELECT * FROM reconciliations WHERE church_id = :churchId AND bank_account_id = :bankAccountId ORDER BY statement_date DESC, id DESC`, { churchId, bankAccountId });
  return rows.map((r) => dto(map(r)));
}

export async function finalizeReconciliation(t: Transaction, churchId: number, actorId: number, id: number) {
  const rec = await getRec(t, churchId, id);
  if (rec.status === 'FINALIZED') throw new ConflictError('that reconciliation is already finalized');
  const s = await summarize(t, churchId, rec);
  if (s.unmatchedStatementLines.length > 0) {
    throw new ConflictError(`${s.unmatchedStatementLines.length} bank line(s) dated on or before ${rec.statementDate} are still unmatched`);
  }
  if (s.difference !== 0) {
    throw new ConflictError(`the reconciliation is out by ${fromMinor(s.difference)}; it can only be finalized at zero`);
  }
  const scope = `church_id = :churchId AND bank_account_id = :bankAccountId AND txn_date <= :date AND reconciliation_id IS NULL AND status IN ('MATCHED','IGNORED')`;
  const params = { churchId, bankAccountId: rec.bankAccountId, date: rec.statementDate };
  await exec(
    t,
    `UPDATE bank_matches SET reconciliation_id = :id WHERE church_id = :churchId AND reconciliation_id IS NULL AND statement_line_id IN
       (SELECT id FROM bank_statement_lines WHERE ${scope})`,
    { ...params, id }
  );
  await exec(t, `UPDATE bank_statement_lines SET reconciliation_id = :id, status = CASE WHEN status = 'MATCHED' THEN 'RECONCILED' ELSE status END WHERE ${scope}`, { ...params, id });
  await exec(
    t,
    `UPDATE reconciliations SET status = 'FINALIZED', cleared_balance_minor = :cleared, difference_minor = 0, finalized_by = :actorId, finalized_at = :now WHERE church_id = :churchId AND id = :id`,
    { cleared: s.clearedBalance, actorId, now: new Date(), churchId, id }
  );
  await recordAudit(t, churchId, { action: 'reconciliation.finalize', entityType: 'reconciliation', entityId: id, actorId, data: { bankAccountId: rec.bankAccountId, statementDate: rec.statementDate, clearedBalance: fromMinor(s.clearedBalance) } });
  return getReconciliation(t, churchId, id);
}

export async function deleteReconciliation(t: Transaction, churchId: number, id: number) {
  const rec = await getRec(t, churchId, id);
  if (rec.status === 'FINALIZED') throw new ConflictError('a finalized reconciliation is immutable');
  await exec(t, `DELETE FROM reconciliations WHERE church_id = :churchId AND id = :id`, { churchId, id });
}
