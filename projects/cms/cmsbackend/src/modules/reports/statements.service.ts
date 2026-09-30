/**
 * Financial statements, all derived from the ledger through balancesBetween (running balances when
 * a range lines up with periods, journal lines when it does not). Nothing here keeps its own
 * totals, so the statements cannot disagree with the books.
 */
import { Transaction } from 'sequelize';
import { select } from '../finance/sql';
import { BalanceRow, balancesBetween } from '../finance/balances.service';
import { fromMinor, toInt } from '../../common/money';
import { BadRequestError } from '../../utils/errors';
import { addDays, daysBetween } from './db';
import { dateOnly } from '../finance/chain';

export interface AccountMeta {
  id: number;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  systemKey: string | null;
  parentId: number | null;
}

export async function accountMap(t: Transaction, churchId: number): Promise<Map<number, AccountMeta>> {
  const rows = await select<any>(t, `SELECT id, code, name, type, system_key, parent_id FROM accounts WHERE church_id = :churchId ORDER BY code`, { churchId });
  return new Map(
    rows.map((r) => [toInt(r.id), { id: toInt(r.id), code: r.code, name: r.name, type: r.type, systemKey: r.system_key, parentId: r.parent_id === null ? null : toInt(r.parent_id) }])
  );
}

export async function currentFiscalYear(t: Transaction, churchId: number, date: string) {
  const row = (await select<any>(t, `SELECT id, name, start_date, end_date FROM fiscal_years WHERE church_id = :churchId AND start_date <= :date AND end_date >= :date`, { churchId, date }))[0];
  return row ? { id: toInt(row.id), name: row.name as string, start: dateOnly(row.start_date), end: dateOnly(row.end_date) } : null;
}

export async function resolveRange(t: Transaction, churchId: number, q: { from?: string; to?: string; yearId?: number }, today: string) {
  if (q.yearId) {
    const row = (await select<any>(t, `SELECT start_date, end_date, name FROM fiscal_years WHERE church_id = :churchId AND id = :id`, { churchId, id: q.yearId }))[0];
    if (!row) throw new BadRequestError(`fiscal year ${q.yearId} was not found`);
    return { from: dateOnly(row.start_date), to: dateOnly(row.end_date), label: row.name as string };
  }
  if (q.from || q.to) {
    const fy = await currentFiscalYear(t, churchId, today);
    const from = q.from ?? fy?.start ?? `${today.slice(0, 4)}-01-01`;
    const to = q.to ?? today;
    if (from > to) throw new BadRequestError('from must not be after to');
    return { from, to, label: `${from} to ${to}` };
  }
  const fy = await currentFiscalYear(t, churchId, today);
  const from = fy?.start ?? `${today.slice(0, 4)}-01-01`;
  return { from, to: today, label: fy ? `${fy.name} to date` : `${from} to ${today}` };
}

export type CompareMode = 'none' | 'prior-period' | 'prior-year';

/** The range a comparison column is drawn from. */
export function comparisonRange(range: { from: string; to: string }, mode: CompareMode): { from: string; to: string } | null {
  if (mode === 'none') return null;
  if (mode === 'prior-year') {
    const shift = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    return { from: shift(range.from), to: shift(range.to) };
  }
  const length = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

interface ActivityTotals {
  byAccount: Map<number, number>;
  byFund: Map<number, { income: number; expense: number }>;
  income: number;
  expense: number;
}

/** Income (credit-debit) and expense (debit-credit) per account for a range, never the closing entry. */
async function activity(t: Transaction, churchId: number, accounts: Map<number, AccountMeta>, range: { from: string; to: string }, fundId?: number): Promise<ActivityTotals> {
  const rows = await balancesBetween(t, churchId, { from: range.from, to: range.to, fundId, includeClosing: false });
  const out: ActivityTotals = { byAccount: new Map(), byFund: new Map(), income: 0, expense: 0 };
  for (const row of rows) {
    const meta = accounts.get(row.accountId);
    if (!meta || (meta.type !== 'INCOME' && meta.type !== 'EXPENSE')) continue;
    const amount = meta.type === 'INCOME' ? row.credit - row.debit : row.debit - row.credit;
    out.byAccount.set(row.accountId, (out.byAccount.get(row.accountId) ?? 0) + amount);
    const fund = out.byFund.get(row.fundId) ?? { income: 0, expense: 0 };
    if (meta.type === 'INCOME') {
      out.income += amount;
      fund.income += amount;
    } else {
      out.expense += amount;
      fund.expense += amount;
    }
    out.byFund.set(row.fundId, fund);
  }
  return out;
}

async function fundMap(t: Transaction, churchId: number) {
  const rows = await select<any>(t, `SELECT id, code, name, restriction FROM funds WHERE church_id = :churchId ORDER BY code`, { churchId });
  return new Map(rows.map((r) => [toInt(r.id), { id: toInt(r.id), code: r.code as string, name: r.name as string, restriction: r.restriction as string }]));
}

export async function incomeStatement(t: Transaction, churchId: number, q: { from: string; to: string; fundId?: number; compare: CompareMode; byFund?: boolean }) {
  const accounts = await accountMap(t, churchId);
  const current = await activity(t, churchId, accounts, q, q.fundId);
  const priorRange = comparisonRange(q, q.compare);
  const prior = priorRange ? await activity(t, churchId, accounts, priorRange, q.fundId) : null;

  const build = (type: 'INCOME' | 'EXPENSE') => {
    const ids = new Set<number>();
    for (const [id] of current.byAccount) if (accounts.get(id)!.type === type) ids.add(id);
    if (prior) for (const [id] of prior.byAccount) if (accounts.get(id)!.type === type) ids.add(id);
    return [...ids]
      .map((id) => {
        const meta = accounts.get(id)!;
        const amount = current.byAccount.get(id) ?? 0;
        const priorAmount = prior ? prior.byAccount.get(id) ?? 0 : undefined;
        return {
          accountId: id,
          code: meta.code,
          name: meta.name,
          amount: fromMinor(amount),
          ...(priorAmount !== undefined ? { priorAmount: fromMinor(priorAmount), change: fromMinor(amount - priorAmount) } : {}),
          _amount: amount
        };
      })
      .filter((line) => line._amount !== 0 || line.priorAmount !== undefined)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(({ _amount, ...line }) => line);
  };

  const funds = await fundMap(t, churchId);
  const report = {
    from: q.from,
    to: q.to,
    fundId: q.fundId ?? null,
    income: build('INCOME'),
    expenses: build('EXPENSE'),
    totalIncome: fromMinor(current.income),
    totalExpenses: fromMinor(current.expense),
    surplus: fromMinor(current.income - current.expense),
    ...(prior && priorRange
      ? {
          prior: {
            from: priorRange.from,
            to: priorRange.to,
            totalIncome: fromMinor(prior.income),
            totalExpenses: fromMinor(prior.expense),
            surplus: fromMinor(prior.income - prior.expense)
          }
        }
      : {}),
    ...(q.byFund
      ? {
          byFund: [...current.byFund]
            .map(([id, v]) => ({ fundId: id, code: funds.get(id)?.code ?? String(id), name: funds.get(id)?.name ?? '', restriction: funds.get(id)?.restriction ?? '', income: fromMinor(v.income), expenses: fromMinor(v.expense), surplus: fromMinor(v.income - v.expense) }))
            .sort((a, b) => a.code.localeCompare(b.code))
        }
      : {})
  };
  return report;
}

function netBy(rows: BalanceRow[], accounts: Map<number, AccountMeta>) {
  const debitNet = new Map<number, number>();
  for (const row of rows) debitNet.set(row.accountId, (debitNet.get(row.accountId) ?? 0) + row.debit - row.credit);
  return debitNet;
}

/**
 * Statement of financial position. Assets are debit balances; liabilities and net assets are
 * credit balances. Income and expense that have not yet been closed to net assets appear as one
 * "current surplus" line so the statement balances at every moment, before and after a year close.
 */
export async function balanceSheet(t: Transaction, churchId: number, q: { asOf: string; fundId?: number }) {
  const accounts = await accountMap(t, churchId);
  const rows = await balancesBetween(t, churchId, { to: q.asOf, fundId: q.fundId, includeClosing: true });
  const debitNet = netBy(rows, accounts);

  const section = (type: AccountMeta['type'], sign: 1 | -1) =>
    [...debitNet]
      .map(([id, net]) => ({ meta: accounts.get(id)!, amount: net * sign }))
      .filter((x) => x.meta && x.meta.type === type && x.amount !== 0)
      .sort((a, b) => a.meta.code.localeCompare(b.meta.code));

  const assets = section('ASSET', 1);
  const liabilities = section('LIABILITY', -1);
  const equity = section('EQUITY', -1);
  let surplus = 0;
  for (const [id, net] of debitNet) {
    const type = accounts.get(id)?.type;
    if (type === 'INCOME' || type === 'EXPENSE') surplus += -net;
  }
  const sum = (list: Array<{ amount: number }>) => list.reduce((s, x) => s + x.amount, 0);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalNetAssets = sum(equity) + surplus;
  const view = (list: typeof assets) => list.map((x) => ({ accountId: x.meta.id, code: x.meta.code, name: x.meta.name, amount: fromMinor(x.amount) }));

  return {
    asOf: q.asOf,
    fundId: q.fundId ?? null,
    assets: view(assets),
    totalAssets: fromMinor(totalAssets),
    liabilities: view(liabilities),
    totalLiabilities: fromMinor(totalLiabilities),
    netAssets: [...view(equity), ...(surplus !== 0 ? [{ accountId: null, code: '', name: 'Current surplus (not yet closed to net assets)', amount: fromMinor(surplus) }] : [])],
    totalNetAssets: fromMinor(totalNetAssets),
    balanced: totalAssets === totalLiabilities + totalNetAssets,
    difference: fromMinor(totalAssets - totalLiabilities - totalNetAssets)
  };
}

/** Postable asset accounts in the cash and bank range of the chart (1010-1199). */
export function cashAccountIds(accounts: Map<number, AccountMeta>): number[] {
  const keys = new Set(['CASH', 'PETTY_CASH', 'BANK_MAIN', 'MPESA']);
  return [...accounts.values()]
    .filter((a) => a.type === 'ASSET' && ((a.code >= '1010' && a.code < '1200') || (a.systemKey !== null && keys.has(a.systemKey))))
    .map((a) => a.id);
}

const SOURCE_LABELS: Record<string, string> = {
  CONTRIBUTION: 'Giving received',
  GIVING_BATCH: 'Giving received (counted batches)',
  MPESA: 'Giving received (M-Pesa)',
  BILL: 'Bills',
  BILL_PAYMENT: 'Paid to suppliers',
  PAYROLL: 'Payroll',
  PAYROLL_PAY: 'Salaries paid',
  PAYROLL_REMIT: 'Statutory remittances',
  STAFF_ADVANCE: 'Staff advances',
  PETTY_CASH: 'Petty cash',
  TRANSFER: 'Transfers between funds',
  MANUAL: 'Manual journals',
  REVERSAL: 'Reversals',
  BANK_FEE: 'Bank charges'
};

/** Direct-method cash flow: real movements on cash, bank and M-Pesa accounts, grouped by where they came from. */
export async function cashFlow(t: Transaction, churchId: number, q: { from: string; to: string; fundId?: number }) {
  const accounts = await accountMap(t, churchId);
  const cash = cashAccountIds(accounts);
  if (cash.length === 0) return { from: q.from, to: q.to, openingCash: '0.00', closingCash: '0.00', netChange: '0.00', inflows: [], outflows: [], accounts: [], reconciles: true };

  const marks = cash.map(() => '?').join(',');
  const fundClause = q.fundId ? 'AND l.fund_id = ?' : '';
  const fundParam = q.fundId ? [q.fundId] : [];
  const moves = await select<any>(
    t,
    `SELECT e.source_type, SUM(l.debit_minor) AS d, SUM(l.credit_minor) AS c
       FROM journal_lines l JOIN journal_entries e ON e.church_id = l.church_id AND e.id = l.entry_id
      WHERE l.church_id = ? AND l.account_id IN (${marks}) AND l.entry_date >= ? AND l.entry_date <= ? ${fundClause}
      GROUP BY e.source_type ORDER BY e.source_type`,
    [churchId, ...cash, q.from, q.to, ...fundParam]
  );
  const opening = (await balancesBetween(t, churchId, { to: addDays(q.from, -1), fundId: q.fundId, includeClosing: true })).filter((r) => cash.includes(r.accountId));
  const closing = (await balancesBetween(t, churchId, { to: q.to, fundId: q.fundId, includeClosing: true })).filter((r) => cash.includes(r.accountId));
  const openingCash = opening.reduce((s, r) => s + r.debit - r.credit, 0);
  const closingCash = closing.reduce((s, r) => s + r.debit - r.credit, 0);

  const flows = moves.map((m) => ({ sourceType: m.source_type as string, label: SOURCE_LABELS[m.source_type as string] ?? (m.source_type as string), net: toInt(m.d) - toInt(m.c), received: toInt(m.d), paid: toInt(m.c) }));
  const net = flows.reduce((s, f) => s + f.net, 0);
  const perAccount = cash.map((id) => {
    const o = opening.filter((r) => r.accountId === id).reduce((s, r) => s + r.debit - r.credit, 0);
    const c = closing.filter((r) => r.accountId === id).reduce((s, r) => s + r.debit - r.credit, 0);
    return { accountId: id, code: accounts.get(id)!.code, name: accounts.get(id)!.name, opening: fromMinor(o), closing: fromMinor(c), change: fromMinor(c - o) };
  }).filter((a) => a.opening !== '0.00' || a.closing !== '0.00');

  return {
    from: q.from,
    to: q.to,
    openingCash: fromMinor(openingCash),
    inflows: flows.filter((f) => f.net > 0).map((f) => ({ sourceType: f.sourceType, label: f.label, amount: fromMinor(f.net) })),
    outflows: flows.filter((f) => f.net < 0).map((f) => ({ sourceType: f.sourceType, label: f.label, amount: fromMinor(-f.net) })),
    netChange: fromMinor(net),
    closingCash: fromMinor(closingCash),
    accounts: perAccount,
    reconciles: openingCash + net === closingCash
  };
}

/** Each fund at a date: cash it holds, everything it has earned and spent, and its net position. */
export async function fundBalances(t: Transaction, churchId: number, asOf: string) {
  const accounts = await accountMap(t, churchId);
  const funds = await fundMap(t, churchId);
  const rows = await balancesBetween(t, churchId, { to: asOf, includeClosing: true });
  const cash = new Set(cashAccountIds(accounts));
  const agg = new Map<number, { cash: number; assets: number; liabilities: number; income: number; expense: number; equity: number }>();
  for (const row of rows) {
    const meta = accounts.get(row.accountId);
    if (!meta) continue;
    const slot = agg.get(row.fundId) ?? { cash: 0, assets: 0, liabilities: 0, income: 0, expense: 0, equity: 0 };
    const net = row.debit - row.credit;
    if (meta.type === 'ASSET') {
      slot.assets += net;
      if (cash.has(meta.id)) slot.cash += net;
    } else if (meta.type === 'LIABILITY') slot.liabilities += -net;
    else if (meta.type === 'INCOME') slot.income += -net;
    else if (meta.type === 'EXPENSE') slot.expense += net;
    else slot.equity += -net;
    agg.set(row.fundId, slot);
  }
  const list = [...funds.values()].map((f) => {
    const a = agg.get(f.id) ?? { cash: 0, assets: 0, liabilities: 0, income: 0, expense: 0, equity: 0 };
    return {
      fundId: f.id,
      code: f.code,
      name: f.name,
      restriction: f.restriction,
      cash: fromMinor(a.cash),
      totalAssets: fromMinor(a.assets),
      liabilities: fromMinor(a.liabilities),
      netAssets: fromMinor(a.equity + a.income - a.expense),
      unclosedIncome: fromMinor(a.income),
      unclosedExpenses: fromMinor(a.expense),
      _net: a.equity + a.income - a.expense
    };
  });
  const totalNet = list.reduce((s, f) => s + f._net, 0);
  return { asOf, funds: list.map(({ _net, ...f }) => f), totalNetAssets: fromMinor(totalNet) };
}

/** A per-account summary for the range: what it held, what moved, what it holds. */
export async function generalLedgerSummary(t: Transaction, churchId: number, q: { from: string; to: string; fundId?: number }) {
  const accounts = await accountMap(t, churchId);
  const before = netBy(await balancesBetween(t, churchId, { to: addDays(q.from, -1), fundId: q.fundId, includeClosing: true }), accounts);
  const during = await balancesBetween(t, churchId, { from: q.from, to: q.to, fundId: q.fundId, includeClosing: false });
  const debit = new Map<number, number>();
  const credit = new Map<number, number>();
  for (const r of during) {
    debit.set(r.accountId, (debit.get(r.accountId) ?? 0) + r.debit);
    credit.set(r.accountId, (credit.get(r.accountId) ?? 0) + r.credit);
  }
  const ids = new Set<number>([...before.keys(), ...debit.keys()]);
  return {
    from: q.from,
    to: q.to,
    accounts: [...ids]
      .map((id) => {
        const meta = accounts.get(id)!;
        const debitNormal = meta.type === 'ASSET' || meta.type === 'EXPENSE';
        const open = before.get(id) ?? 0;
        const d = debit.get(id) ?? 0;
        const c = credit.get(id) ?? 0;
        const sign = debitNormal ? 1 : -1;
        return { accountId: id, code: meta.code, name: meta.name, type: meta.type, opening: fromMinor(open * sign), debits: fromMinor(d), credits: fromMinor(c), closing: fromMinor((open + d - c) * sign), _moved: d + c + open };
      })
      .filter((a) => a._moved !== 0)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(({ _moved, ...a }) => a)
  };
}

/** Spending by ministry, from the ministry tag on expense lines. */
export async function expenseByMinistry(t: Transaction, churchId: number, q: { from: string; to: string; fundId?: number }) {
  const rows = await select<any>(
    t,
    `SELECT l.ministry_id, l.account_id, SUM(l.debit_minor - l.credit_minor) AS spent
       FROM journal_lines l JOIN accounts a ON a.church_id = l.church_id AND a.id = l.account_id
      WHERE l.church_id = ? AND a.type = 'EXPENSE' AND l.entry_date >= ? AND l.entry_date <= ? ${q.fundId ? 'AND l.fund_id = ?' : ''}
        AND l.entry_id NOT IN (SELECT id FROM journal_entries WHERE church_id = ? AND source_type = 'CLOSING')
      GROUP BY l.ministry_id, l.account_id`,
    [churchId, q.from, q.to, ...(q.fundId ? [q.fundId] : []), churchId]
  );
  const ministries = await select<any>(t, `SELECT id, name FROM ministries WHERE church_id = :churchId`, { churchId });
  const names = new Map(ministries.map((m) => [toInt(m.id), m.name as string]));
  const accounts = await accountMap(t, churchId);
  const groups = new Map<number | null, { total: number; accounts: Array<{ code: string; name: string; amount: number }> }>();
  for (const r of rows) {
    const key = r.ministry_id === null ? null : toInt(r.ministry_id);
    const g = groups.get(key) ?? { total: 0, accounts: [] };
    const amount = toInt(r.spent);
    if (amount === 0) continue;
    g.total += amount;
    const meta = accounts.get(toInt(r.account_id))!;
    g.accounts.push({ code: meta.code, name: meta.name, amount });
    groups.set(key, g);
  }
  const grand = [...groups.values()].reduce((s, g) => s + g.total, 0);
  return {
    from: q.from,
    to: q.to,
    total: fromMinor(grand),
    ministries: [...groups]
      .map(([id, g]) => ({
        ministryId: id,
        name: id === null ? 'Not assigned to a ministry' : names.get(id) ?? `Ministry ${id}`,
        total: fromMinor(g.total),
        share: grand === 0 ? '0.0' : ((g.total * 1000) / grand / 10).toFixed(1),
        accounts: g.accounts.sort((a, b) => a.code.localeCompare(b.code)).map((a) => ({ code: a.code, name: a.name, amount: fromMinor(a.amount) })),
        _t: g.total
      }))
      .sort((a, b) => b._t - a._t)
      .map(({ _t, ...m }) => m)
  };
}
