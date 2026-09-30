import { Transaction } from 'sequelize';
import { select } from '../finance/sql';
import { balancesBetween } from '../finance/balances.service';
import { fromMinor, toInt } from '../../common/money';
import { addDays, addMonths, columnExists, decimalToMinor, tableExists } from './db';
import { accountMap, cashAccountIds, currentFiscalYear, incomeStatement } from './statements.service';
import { givingByMonth } from './giving.reports';

/** One payload for the landing screen. Sections that depend on optional modules are null when those tables are absent. */
export async function dashboard(t: Transaction, churchId: number, today: string) {
  const fy = await currentFiscalYear(t, churchId, today);
  const yearStart = fy?.start ?? `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 7)}-01`;

  const [mtd, ytd] = await Promise.all([
    incomeStatement(t, churchId, { from: monthStart, to: today, compare: 'none' }),
    incomeStatement(t, churchId, { from: yearStart, to: today, compare: 'none' })
  ]);

  const accounts = await accountMap(t, churchId);
  const cashIds = new Set(cashAccountIds(accounts));
  const balances = await balancesBetween(t, churchId, { to: today, includeClosing: true });
  const cashBy = new Map<number, number>();
  let payable = 0;
  for (const b of balances) {
    if (cashIds.has(b.accountId)) cashBy.set(b.accountId, (cashBy.get(b.accountId) ?? 0) + b.debit - b.credit);
    if (accounts.get(b.accountId)?.systemKey === 'AP') payable += b.credit - b.debit;
  }
  const cashAccounts = [...cashBy].filter(([, v]) => v !== 0).map(([id, v]) => ({ accountId: id, code: accounts.get(id)!.code, name: accounts.get(id)!.name, balance: fromMinor(v) }));

  const trendFrom = `${addMonths(`${today.slice(0, 7)}-01`, -11).slice(0, 7)}-01`;
  const trend = await givingByMonth(t, churchId, { from: trendFrom, to: today });

  let bills: null | { outstanding: string; overdue: string; dueNext7Days: string; overdueCount: number } = null;
  if ((await tableExists(t, 'bills')) && (await columnExists(t, 'bills', 'paid_minor'))) {
    const rows = await select<any>(
      t,
      `SELECT total_minor, paid_minor, due_date FROM bills WHERE church_id = ? AND status IN ('APPROVED','PARTIALLY_PAID')`,
      [churchId]
    );
    let outstanding = 0;
    let overdue = 0;
    let soon = 0;
    let overdueCount = 0;
    for (const r of rows) {
      const left = toInt(r.total_minor) - toInt(r.paid_minor);
      const due = String(r.due_date).slice(0, 10);
      outstanding += left;
      if (due < today) {
        overdue += left;
        overdueCount += 1;
      } else if (due <= addDays(today, 7)) soon += left;
    }
    bills = { outstanding: fromMinor(outstanding), overdue: fromMinor(overdue), dueNext7Days: fromMinor(soon), overdueCount };
  }

  let pledges: null | { activePledges: number; pledged: string; received: string; outstanding: string; campaigns: Array<{ id: number; name: string; goal: string; raised: string; percent: string }> } = null;
  if ((await tableExists(t, 'pledges')) && (await columnExists(t, 'pledges', 'amount_minor')) && (await columnExists(t, 'contribution', 'pledge_id'))) {
    const p = (await select<any>(t, `SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor), 0) AS pledged FROM pledges WHERE church_id = ? AND status = 'ACTIVE'`, [churchId]))[0];
    const got = (await select<any>(t, `SELECT COALESCE(SUM(c.amount), 0) AS total FROM contribution c JOIN pledges p ON p.church_id = c.church_id AND p.id = c.pledge_id WHERE c.church_id = ? AND p.status = 'ACTIVE' AND c.status = 'POSTED'`, [churchId]))[0];
    const pledged = toInt(p.pledged);
    const received = decimalToMinor(got.total);
    const camps = (await tableExists(t, 'giving_campaigns'))
      ? await select<any>(
          t,
          `SELECT k.id, k.name, k.goal_minor, (SELECT COALESCE(SUM(c.amount), 0) FROM contribution c WHERE c.church_id = k.church_id AND c.campaign_id = k.id AND c.status = 'POSTED') AS raised
             FROM giving_campaigns k WHERE k.church_id = ? AND k.status = 'ACTIVE' ORDER BY k.id LIMIT 10`,
          [churchId]
        )
      : [];
    pledges = {
      activePledges: toInt(p.n),
      pledged: fromMinor(pledged),
      received: fromMinor(received),
      outstanding: fromMinor(Math.max(0, pledged - received)),
      campaigns: camps.map((k) => ({ id: toInt(k.id), name: k.name, goal: fromMinor(k.goal_minor), raised: fromMinor(decimalToMinor(k.raised)), percent: toInt(k.goal_minor) === 0 ? '0.0' : ((decimalToMinor(k.raised) * 1000) / toInt(k.goal_minor) / 10).toFixed(1) }))
    };
  }

  let budget: null | { name: string; budgetedExpensesToDate: string; actualExpensesToDate: string; utilisation: string | null } = null;
  if (fy && (await tableExists(t, 'budgets')) && (await tableExists(t, 'budget_lines'))) {
    const active = (await select<any>(t, `SELECT id, name FROM budgets WHERE church_id = ? AND fiscal_year_id = ? AND status = 'ACTIVE'`, [churchId, fy.id]))[0];
    if (active) {
      const period = (await select<any>(t, `SELECT number FROM fiscal_periods WHERE church_id = ? AND fiscal_year_id = ? AND start_date <= ? AND end_date >= ? AND number <= 12`, [churchId, fy.id, today, today]))[0];
      const upTo = period ? toInt(period.number) : 12;
      const planned = (
        await select<any>(
          t,
          `SELECT COALESCE(SUM(bl.amount_minor), 0) AS planned FROM budget_lines bl JOIN accounts a ON a.church_id = bl.church_id AND a.id = bl.account_id
            WHERE bl.church_id = ? AND bl.budget_id = ? AND a.type = 'EXPENSE' AND bl.month <= ?`,
          [churchId, toInt(active.id), upTo]
        )
      )[0];
      const plannedMinor = toInt(planned.planned);
      const actualMinor = Math.round(Number(ytd.totalExpenses) * 100);
      budget = {
        name: active.name,
        budgetedExpensesToDate: fromMinor(plannedMinor),
        actualExpensesToDate: fromMinor(actualMinor),
        utilisation: plannedMinor === 0 ? null : ((actualMinor * 1000) / plannedMinor / 10).toFixed(1)
      };
    }
  }

  return {
    asOf: today,
    fiscalYear: fy ? { name: fy.name, start: fy.start, end: fy.end } : null,
    month: { from: monthStart, income: mtd.totalIncome, expenses: mtd.totalExpenses, surplus: mtd.surplus },
    yearToDate: { from: yearStart, income: ytd.totalIncome, expenses: ytd.totalExpenses, surplus: ytd.surplus },
    cash: { total: fromMinor([...cashBy.values()].reduce((s, v) => s + v, 0)), accounts: cashAccounts },
    accountsPayable: fromMinor(payable),
    bills,
    pledges,
    budget,
    givingTrend: trend.months
  };
}
