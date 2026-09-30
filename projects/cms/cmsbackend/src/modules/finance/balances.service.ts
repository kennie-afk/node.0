/**
 * Reads balances. The fast path sums ledger_balances (a handful of rows per period); only a date
 * range that cuts through the middle of a period falls back to summing that period's journal
 * lines. Both paths return the same numbers, which the tests assert.
 */
import { Transaction } from 'sequelize';
import { select } from './sql';
import { toInt } from '../../common/money';

export interface BalanceRow {
  accountId: number;
  fundId: number;
  debit: number;
  credit: number;
}

export interface BalanceQuery {
  /** Inclusive start; omit for "since the beginning" (balance sheet). */
  from?: string;
  /** Inclusive end. */
  to: string;
  fundId?: number;
  /** Include the year-end closing period. True for the balance sheet, false for activity. */
  includeClosing?: boolean;
}

export async function balancesBetween(t: Transaction, churchId: number, query: BalanceQuery): Promise<BalanceRow[]> {
  const closingClause = query.includeClosing ? '' : 'AND number <= 12';
  const overlapping = await select<any>(
    t,
    `SELECT id, start_date, end_date FROM fiscal_periods
      WHERE church_id = :churchId AND start_date <= :to ${query.from ? 'AND end_date >= :from' : ''} ${closingClause}`,
    { churchId, to: query.to, from: query.from }
  );

  const whole: number[] = [];
  const partial: number[] = [];
  for (const period of overlapping) {
    const start = String(period.start_date).slice(0, 10);
    const end = String(period.end_date).slice(0, 10);
    const inside = end <= query.to && (!query.from || start >= query.from);
    (inside ? whole : partial).push(toInt(period.id));
  }

  const totals = new Map<string, BalanceRow>();
  const add = (row: any, debit: unknown, credit: unknown) => {
    const key = `${row.account_id}:${row.fund_id}`;
    const slot = totals.get(key) ?? { accountId: toInt(row.account_id), fundId: toInt(row.fund_id), debit: 0, credit: 0 };
    slot.debit += toInt(debit);
    slot.credit += toInt(credit);
    totals.set(key, slot);
  };

  const fundFilter = query.fundId ? 'AND fund_id = ?' : '';

  if (whole.length > 0) {
    const rows = await select<any>(
      t,
      `SELECT account_id, fund_id, SUM(debit_minor) AS d, SUM(credit_minor) AS c FROM ledger_balances
        WHERE church_id = ? AND period_id IN (${whole.map(() => '?').join(',')}) ${fundFilter}
        GROUP BY account_id, fund_id`,
      [churchId, ...whole, ...(query.fundId ? [query.fundId] : [])]
    );
    for (const row of rows) add(row, row.d, row.c);
  }

  if (partial.length > 0) {
    const rows = await select<any>(
      t,
      `SELECT account_id, fund_id, SUM(debit_minor) AS d, SUM(credit_minor) AS c FROM journal_lines
        WHERE church_id = ? AND period_id IN (${partial.map(() => '?').join(',')}) AND entry_date <= ? ${query.from ? 'AND entry_date >= ?' : ''} ${fundFilter}
        GROUP BY account_id, fund_id`,
      [churchId, ...partial, query.to, ...(query.from ? [query.from] : []), ...(query.fundId ? [query.fundId] : [])]
    );
    for (const row of rows) add(row, row.d, row.c);
  }

  return [...totals.values()].filter((row) => row.debit !== 0 || row.credit !== 0);
}

export interface TrialBalanceLine {
  accountId: number;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
}

/** Debit-side or credit-side closing balance for each account, with the two sides totalled. */
export async function trialBalance(t: Transaction, churchId: number, asOf: string, fundId?: number) {
  const rows = await balancesBetween(t, churchId, { to: asOf, fundId, includeClosing: true });
  const byAccount = new Map<number, { debit: number; credit: number }>();
  for (const row of rows) {
    const slot = byAccount.get(row.accountId) ?? { debit: 0, credit: 0 };
    slot.debit += row.debit;
    slot.credit += row.credit;
    byAccount.set(row.accountId, slot);
  }
  if (byAccount.size === 0) return { asOf, lines: [] as TrialBalanceLine[], totalDebit: 0, totalCredit: 0 };

  const ids = [...byAccount.keys()];
  const accounts = await select<any>(
    t,
    `SELECT id, code, name, type FROM accounts WHERE church_id = ? AND id IN (${ids.map(() => '?').join(',')}) ORDER BY code`,
    [churchId, ...ids]
  );
  const lines: TrialBalanceLine[] = accounts
    .map((account) => {
    const slot = byAccount.get(toInt(account.id))!;
    const net = slot.debit - slot.credit;
    return {
      accountId: toInt(account.id),
      code: account.code,
      name: account.name,
      type: account.type,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0
    };
    })
    // An account whose debits and credits cancel carries no balance and does not belong here.
    .filter((line) => line.debit !== 0 || line.credit !== 0);
  return {
    asOf,
    lines,
    totalDebit: lines.reduce((s, l) => s + l.debit, 0),
    totalCredit: lines.reduce((s, l) => s + l.credit, 0)
  };
}
