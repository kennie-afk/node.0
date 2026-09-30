import { Transaction } from 'sequelize';
import { allocate, fromMinor, toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { exec, select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';
import { balancesBetween } from '../finance/balances.service';
import { loadSettings } from '../finance/setup.service';
import { dateOnly } from '../finance/chain';

export interface LineInput {
  accountId: number;
  fundId: number;
  ministryId?: number | null;
  /** Twelve monthly amounts (minor units), or an annual total spread evenly, or one month. */
  months?: number[];
  annual?: number;
  month?: number;
  amount?: number;
}

function mapBudget(row: any) {
  return {
    id: toInt(row.id),
    fiscalYearId: toInt(row.fiscal_year_id),
    name: row.name,
    status: row.status as 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'CLOSED',
    notes: row.notes,
    createdBy: row.created_by === null ? null : toInt(row.created_by),
    approvedBy: row.approved_by === null ? null : toInt(row.approved_by),
    approvedAt: row.approved_at,
    activatedAt: row.activated_at
  };
}

export async function getBudgetRow(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `SELECT * FROM budgets WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`budget ${id} was not found`);
  return mapBudget(row);
}

/** Expands the flexible line shapes into one (month, amount) cell each. */
function cells(input: LineInput): Array<{ month: number; amount: number }> {
  if (input.months) {
    if (input.months.length !== 12) throw new BadRequestError('months must contain exactly twelve amounts');
    return input.months.map((amount, i) => ({ month: i + 1, amount }));
  }
  if (input.annual !== undefined) {
    const parts = allocate(input.annual, Array(12).fill(1));
    return parts.map((amount, i) => ({ month: i + 1, amount }));
  }
  if (input.month !== undefined && input.amount !== undefined) return [{ month: input.month, amount: input.amount }];
  throw new BadRequestError('each line needs months, annual, or month with amount');
}

async function assertLineRefs(t: Transaction, churchId: number, lines: LineInput[]) {
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const fundIds = [...new Set(lines.map((l) => l.fundId))];
  const ministryIds = [...new Set(lines.map((l) => l.ministryId).filter((v): v is number => !!v))];
  if (accountIds.length) {
    const rows = await select<any>(t, `SELECT id, type, code FROM accounts WHERE church_id = ? AND id IN (${accountIds.map(() => '?').join(',')})`, [churchId, ...accountIds]);
    const byId = new Map(rows.map((r) => [toInt(r.id), r]));
    for (const id of accountIds) {
      const a = byId.get(id);
      if (!a) throw new BadRequestError(`account ${id} does not exist in this church`);
      if (a.type !== 'INCOME' && a.type !== 'EXPENSE') throw new BadRequestError(`account ${a.code} is not an income or expense account; budgets cover those only`);
    }
  }
  if (fundIds.length) {
    const rows = await select<any>(t, `SELECT id FROM funds WHERE church_id = ? AND id IN (${fundIds.map(() => '?').join(',')})`, [churchId, ...fundIds]);
    if (rows.length !== fundIds.length) throw new BadRequestError('a fund in the budget does not exist in this church');
  }
  if (ministryIds.length) {
    const rows = await select<any>(t, `SELECT id FROM ministries WHERE church_id = ? AND id IN (${ministryIds.map(() => '?').join(',')})`, [churchId, ...ministryIds]);
    if (rows.length !== ministryIds.length) throw new BadRequestError('a ministry in the budget does not exist in this church');
  }
}

export async function writeLines(t: Transaction, churchId: number, budgetId: number, lines: LineInput[], mode: 'replace' | 'merge') {
  await assertLineRefs(t, churchId, lines);
  if (mode === 'replace') await exec(t, `DELETE FROM budget_lines WHERE church_id = :churchId AND budget_id = :budgetId`, { churchId, budgetId });
  for (const line of lines) {
    for (const cell of cells(line)) {
      if (!Number.isSafeInteger(cell.amount) || cell.amount < 0) throw new BadRequestError('budget amounts must be zero or more');
      await exec(
        t,
        `INSERT INTO budget_lines (church_id, budget_id, account_id, fund_id, ministry_id, ministry_key, month, amount_minor)
         VALUES (:churchId, :budgetId, :accountId, :fundId, :ministryId, :ministryKey, :month, :amount)
         ON CONFLICT (church_id, budget_id, account_id, fund_id, ministry_key, month) DO UPDATE SET amount_minor = EXCLUDED.amount_minor`,
        { churchId, budgetId, accountId: line.accountId, fundId: line.fundId, ministryId: line.ministryId ?? null, ministryKey: line.ministryId ?? 0, month: cell.month, amount: cell.amount }
      );
    }
  }
}

export async function createBudget(t: Transaction, churchId: number, actorId: number, input: { fiscalYearId: number; name: string; notes?: string | null; lines?: LineInput[] }) {
  const year = await selectOne(t, `SELECT id FROM fiscal_years WHERE church_id = :churchId AND id = :id`, { churchId, id: input.fiscalYearId });
  if (!year) throw new BadRequestError(`fiscal year ${input.fiscalYearId} does not exist`);
  const dup = await selectOne(t, `SELECT id FROM budgets WHERE church_id = :churchId AND fiscal_year_id = :y AND name = :name`, { churchId, y: input.fiscalYearId, name: input.name });
  if (dup) throw new ConflictError(`a budget called "${input.name}" already exists for that year`);
  await exec(t, `INSERT INTO budgets (church_id, fiscal_year_id, name, notes, created_by) VALUES (:churchId, :y, :name, :notes, :actorId)`, {
    churchId, y: input.fiscalYearId, name: input.name, notes: input.notes ?? null, actorId
  });
  const row = await selectOne<any>(t, `SELECT * FROM budgets WHERE church_id = :churchId AND fiscal_year_id = :y AND name = :name`, { churchId, y: input.fiscalYearId, name: input.name });
  const budget = mapBudget(row);
  if (input.lines?.length) await writeLines(t, churchId, budget.id, input.lines, 'replace');
  await recordAudit(t, churchId, { action: 'budget.create', entityType: 'budget', entityId: budget.id, actorId, data: { name: input.name } });
  return budget;
}

export async function listBudgets(t: Transaction, churchId: number, fiscalYearId?: number) {
  const rows = await select<any>(
    t,
    `SELECT b.*, (SELECT COALESCE(SUM(l.amount_minor),0) FROM budget_lines l JOIN accounts a ON a.church_id = l.church_id AND a.id = l.account_id
                   WHERE l.church_id = b.church_id AND l.budget_id = b.id AND a.type = 'INCOME') AS income_minor,
            (SELECT COALESCE(SUM(l.amount_minor),0) FROM budget_lines l JOIN accounts a ON a.church_id = l.church_id AND a.id = l.account_id
                   WHERE l.church_id = b.church_id AND l.budget_id = b.id AND a.type = 'EXPENSE') AS expense_minor
       FROM budgets b WHERE b.church_id = ? ${fiscalYearId ? 'AND b.fiscal_year_id = ?' : ''} ORDER BY b.fiscal_year_id DESC, b.id DESC`,
    fiscalYearId ? [churchId, fiscalYearId] : [churchId]
  );
  return rows.map((r) => ({ ...mapBudget(r), totalIncome: fromMinor(r.income_minor), totalExpense: fromMinor(r.expense_minor) }));
}

export async function getBudget(t: Transaction, churchId: number, id: number) {
  const budget = await getBudgetRow(t, churchId, id);
  const lines = await select<any>(
    t,
    `SELECT l.*, a.code AS account_code, a.name AS account_name, a.type AS account_type, f.code AS fund_code
       FROM budget_lines l JOIN accounts a ON a.church_id = l.church_id AND a.id = l.account_id
       JOIN funds f ON f.church_id = l.church_id AND f.id = l.fund_id
      WHERE l.church_id = :churchId AND l.budget_id = :id ORDER BY a.code, l.fund_id, l.ministry_key, l.month`,
    { churchId, id }
  );
  // One row per account+fund+ministry with twelve months, the shape a grid editor wants.
  const grid = new Map<string, any>();
  for (const l of lines) {
    const key = `${l.account_id}:${l.fund_id}:${l.ministry_key}`;
    const row = grid.get(key) ?? {
      accountId: toInt(l.account_id), accountCode: l.account_code, accountName: l.account_name, accountType: l.account_type,
      fundId: toInt(l.fund_id), fundCode: l.fund_code, ministryId: l.ministry_id === null ? null : toInt(l.ministry_id),
      months: Array(12).fill('0.00'), annual: 0
    };
    row.months[toInt(l.month) - 1] = fromMinor(l.amount_minor);
    row.annual += toInt(l.amount_minor);
    grid.set(key, row);
  }
  const rows = [...grid.values()].map((r) => ({ ...r, annual: fromMinor(r.annual) }));
  const total = (type: string) => rows.filter((r) => r.accountType === type).reduce((s, r) => s + Math.round(Number(r.annual) * 100), 0);
  return { ...budget, lines: rows, totalIncome: fromMinor(total('INCOME')), totalExpense: fromMinor(total('EXPENSE')) };
}

async function requireStatus(t: Transaction, churchId: number, id: number, allowed: string[], verb: string) {
  const budget = await getBudgetRow(t, churchId, id);
  if (!allowed.includes(budget.status)) throw new ConflictError(`a ${budget.status.toLowerCase()} budget cannot be ${verb}`);
  return budget;
}

export async function updateBudget(t: Transaction, churchId: number, actorId: number, id: number, changes: { name?: string; notes?: string | null; lines?: LineInput[]; mode?: 'replace' | 'merge' }) {
  const budget = await requireStatus(t, churchId, id, ['DRAFT'], 'edited');
  if (changes.name || changes.notes !== undefined) {
    await exec(t, `UPDATE budgets SET name = :name, notes = :notes, updated_at = :now WHERE church_id = :churchId AND id = :id`, {
      name: changes.name ?? budget.name, notes: changes.notes === undefined ? budget.notes : changes.notes, now: new Date(), churchId, id
    });
  }
  if (changes.lines) await writeLines(t, churchId, id, changes.lines, changes.mode ?? 'merge');
  await recordAudit(t, churchId, { action: 'budget.update', entityType: 'budget', entityId: id, actorId, data: { lines: changes.lines?.length ?? 0 } });
  return getBudget(t, churchId, id);
}

export async function deleteBudget(t: Transaction, churchId: number, actorId: number, id: number) {
  await requireStatus(t, churchId, id, ['DRAFT'], 'deleted');
  await exec(t, `DELETE FROM budgets WHERE church_id = :churchId AND id = :id`, { churchId, id });
  await recordAudit(t, churchId, { action: 'budget.delete', entityType: 'budget', entityId: id, actorId });
}

export async function approveBudget(t: Transaction, churchId: number, actorId: number, id: number) {
  const budget = await requireStatus(t, churchId, id, ['DRAFT'], 'approved');
  const settings = await loadSettings(t, churchId);
  if (settings.requireSeparationOfDuties && budget.createdBy === actorId) {
    throw new ConflictError('separation of duties: the person who drafted a budget cannot approve it');
  }
  const any = await selectOne(t, `SELECT 1 AS x FROM budget_lines WHERE church_id = :churchId AND budget_id = :id LIMIT 1`, { churchId, id });
  if (!any) throw new BadRequestError('an empty budget cannot be approved');
  await exec(t, `UPDATE budgets SET status = 'APPROVED', approved_by = :actorId, approved_at = :now, updated_at = :now WHERE church_id = :churchId AND id = :id`, { actorId, now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'budget.approve', entityType: 'budget', entityId: id, actorId });
  return getBudgetRow(t, churchId, id);
}

/** Making a budget active retires whichever one was active for that year. */
export async function activateBudget(t: Transaction, churchId: number, actorId: number, id: number) {
  const budget = await requireStatus(t, churchId, id, ['APPROVED'], 'activated');
  await exec(t, `UPDATE budgets SET status = 'CLOSED', updated_at = :now WHERE church_id = :churchId AND fiscal_year_id = :y AND status = 'ACTIVE'`, { now: new Date(), churchId, y: budget.fiscalYearId });
  await exec(t, `UPDATE budgets SET status = 'ACTIVE', activated_at = :now, updated_at = :now WHERE church_id = :churchId AND id = :id`, { now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'budget.activate', entityType: 'budget', entityId: id, actorId });
  return getBudgetRow(t, churchId, id);
}

export async function closeBudget(t: Transaction, churchId: number, actorId: number, id: number) {
  await requireStatus(t, churchId, id, ['ACTIVE', 'APPROVED'], 'closed');
  await exec(t, `UPDATE budgets SET status = 'CLOSED', updated_at = :now WHERE church_id = :churchId AND id = :id`, { now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'budget.close', entityType: 'budget', entityId: id, actorId });
  return getBudgetRow(t, churchId, id);
}

/** A new draft for another year, copied from an existing budget with a percentage uplift (basis points). */
export async function copyBudget(t: Transaction, churchId: number, actorId: number, sourceId: number, input: { fiscalYearId: number; name: string; upliftBasisPoints?: number }) {
  await getBudgetRow(t, churchId, sourceId);
  const created = await createBudget(t, churchId, actorId, { fiscalYearId: input.fiscalYearId, name: input.name, notes: `Copied from budget ${sourceId}` });
  const uplift = input.upliftBasisPoints ?? 0;
  const rows = await select<any>(t, `SELECT * FROM budget_lines WHERE church_id = :churchId AND budget_id = :sourceId`, { churchId, sourceId });
  for (const r of rows) {
    const amount = Math.round((toInt(r.amount_minor) * (10_000 + uplift)) / 10_000);
    await exec(
      t,
      `INSERT INTO budget_lines (church_id, budget_id, account_id, fund_id, ministry_id, ministry_key, month, amount_minor)
       VALUES (:churchId, :budgetId, :a, :f, :m, :mk, :month, :amount)`,
      { churchId, budgetId: created.id, a: toInt(r.account_id), f: toInt(r.fund_id), m: r.ministry_id, mk: toInt(r.ministry_key), month: toInt(r.month), amount }
    );
  }
  await recordAudit(t, churchId, { action: 'budget.copy', entityType: 'budget', entityId: created.id, actorId, data: { sourceId, upliftBasisPoints: uplift } });
  return getBudget(t, churchId, created.id);
}

// ---- actuals ---------------------------------------------------------------------------------

async function yearInfo(t: Transaction, churchId: number, fiscalYearId: number) {
  const year = await selectOne<any>(t, `SELECT * FROM fiscal_years WHERE church_id = :churchId AND id = :fiscalYearId`, { churchId, fiscalYearId });
  if (!year) throw new NotFoundError('fiscal year not found');
  const periods = await select<any>(t, `SELECT id, number, start_date, end_date FROM fiscal_periods WHERE church_id = :churchId AND fiscal_year_id = :fiscalYearId AND number <= 12 ORDER BY number`, { churchId, fiscalYearId });
  return { start: dateOnly(year.start_date), end: dateOnly(year.end_date), periods: periods.map((p) => ({ id: toInt(p.id), number: toInt(p.number), start: dateOnly(p.start_date), end: dateOnly(p.end_date) })) };
}

interface Cell {
  budgetIncome: number;
  actualIncome: number;
  budgetExpense: number;
  actualExpense: number;
  committed: number;
}
const blank = (): Cell => ({ budgetIncome: 0, actualIncome: 0, budgetExpense: 0, actualExpense: 0, committed: 0 });

export type GroupBy = 'account' | 'fund' | 'ministry' | 'month';

export async function variance(t: Transaction, churchId: number, budgetId: number, options: { groupBy: GroupBy; throughMonth?: number; fundId?: number; accountId?: number }) {
  const budget = await getBudgetRow(t, churchId, budgetId);
  const year = await yearInfo(t, churchId, budget.fiscalYearId);
  const through = Math.min(options.throughMonth ?? 12, 12);
  const throughPeriod = year.periods.find((p) => p.number === through)!;
  const periodById = new Map(year.periods.map((p) => [p.id, p.number]));

  const accounts = new Map<number, any>((await select<any>(t, `SELECT id, code, name, type FROM accounts WHERE church_id = :churchId`, { churchId })).map((a) => [toInt(a.id), a]));
  const funds = new Map<number, any>((await select<any>(t, `SELECT id, code, name FROM funds WHERE church_id = :churchId`, { churchId })).map((f) => [toInt(f.id), f]));
  const ministries = new Map<number, any>((await select<any>(t, `SELECT id, name FROM ministries WHERE church_id = :churchId`, { churchId })).map((m) => [toInt(m.id), m]));

  const rows = new Map<string, { label: string; code?: string; cell: Cell }>();
  const slot = (key: string, label: string, code?: string) => {
    let s = rows.get(key);
    if (!s) rows.set(key, (s = { label, code, cell: blank() }));
    return s;
  };
  const keyFor = (accountId: number, fundId: number, ministryId: number | null, month: number): { key: string; label: string; code?: string } | null => {
    switch (options.groupBy) {
      case 'account': { const a = accounts.get(accountId)!; return { key: String(accountId), label: a.name, code: a.code }; }
      case 'fund': { const f = funds.get(fundId)!; return { key: String(fundId), label: f.name, code: f.code }; }
      case 'ministry': return ministryId ? { key: String(ministryId), label: ministries.get(ministryId)?.name ?? `Ministry ${ministryId}` } : null;
      case 'month': return { key: String(month).padStart(2, '0'), label: `Month ${month}` };
    }
  };

  // Budget side.
  const lines = await select<any>(
    t,
    `SELECT l.account_id, l.fund_id, l.ministry_id, l.month, l.amount_minor FROM budget_lines l
      WHERE l.church_id = ? AND l.budget_id = ? AND l.month <= ? ${options.fundId ? 'AND l.fund_id = ?' : ''} ${options.accountId ? 'AND l.account_id = ?' : ''}`,
    [churchId, budgetId, through, ...(options.fundId ? [options.fundId] : []), ...(options.accountId ? [options.accountId] : [])]
  );
  for (const l of lines) {
    const k = keyFor(toInt(l.account_id), toInt(l.fund_id), l.ministry_id === null ? null : toInt(l.ministry_id), toInt(l.month));
    if (!k) continue;
    const s = slot(k.key, k.label, k.code);
    const type = accounts.get(toInt(l.account_id))!.type;
    if (type === 'INCOME') s.cell.budgetIncome += toInt(l.amount_minor);
    else s.cell.budgetExpense += toInt(l.amount_minor);
  }

  // Actual side.
  const addActual = (accountId: number, fundId: number, ministryId: number | null, month: number, debit: number, credit: number) => {
    const type = accounts.get(accountId)?.type;
    if (type !== 'INCOME' && type !== 'EXPENSE') return;
    const k = keyFor(accountId, fundId, ministryId, month);
    if (!k) return;
    const s = slot(k.key, k.label, k.code);
    if (type === 'INCOME') s.cell.actualIncome += credit - debit;
    else s.cell.actualExpense += debit - credit;
  };

  if (options.groupBy === 'account' || options.groupBy === 'fund') {
    const balances = await balancesBetween(t, churchId, { from: year.start, to: throughPeriod.end, fundId: options.fundId });
    for (const b of balances) {
      if (options.accountId && b.accountId !== options.accountId) continue;
      addActual(b.accountId, b.fundId, null, 0, b.debit, b.credit);
    }
  } else if (options.groupBy === 'month') {
    const ids = year.periods.filter((p) => p.number <= through).map((p) => p.id);
    const r = await select<any>(
      t,
      `SELECT period_id, account_id, fund_id, SUM(debit_minor) AS d, SUM(credit_minor) AS c FROM ledger_balances
        WHERE church_id = ? AND period_id IN (${ids.map(() => '?').join(',')}) ${options.fundId ? 'AND fund_id = ?' : ''} GROUP BY period_id, account_id, fund_id`,
      [churchId, ...ids, ...(options.fundId ? [options.fundId] : [])]
    );
    for (const x of r) {
      if (options.accountId && toInt(x.account_id) !== options.accountId) continue;
      addActual(toInt(x.account_id), toInt(x.fund_id), null, periodById.get(toInt(x.period_id))!, toInt(x.d), toInt(x.c));
    }
  } else {
    const r = await select<any>(
      t,
      `SELECT ministry_id, account_id, fund_id, SUM(debit_minor) AS d, SUM(credit_minor) AS c FROM journal_lines
        WHERE church_id = ? AND ministry_id IS NOT NULL AND entry_date >= ? AND entry_date <= ? ${options.fundId ? 'AND fund_id = ?' : ''} ${options.accountId ? 'AND account_id = ?' : ''}
        GROUP BY ministry_id, account_id, fund_id`,
      [churchId, year.start, throughPeriod.end, ...(options.fundId ? [options.fundId] : []), ...(options.accountId ? [options.accountId] : [])]
    );
    for (const x of r) addActual(toInt(x.account_id), toInt(x.fund_id), toInt(x.ministry_id), 0, toInt(x.d), toInt(x.c));
  }

  // Commitments: bills submitted and awaiting approval. Approved bills are already in the actuals.
  if (options.groupBy !== 'month') {
    const c = await select<any>(
      t,
      `SELECT bl.account_id, bl.fund_id, bl.ministry_id, SUM(bl.amount_minor) AS amount
         FROM bill_lines bl JOIN bills b ON b.church_id = bl.church_id AND b.id = bl.bill_id
        WHERE bl.church_id = ? AND b.status = 'SUBMITTED' AND b.bill_date >= ? AND b.bill_date <= ?
        GROUP BY bl.account_id, bl.fund_id, bl.ministry_id`,
      [churchId, year.start, year.end]
    );
    for (const x of c) {
      if (options.fundId && toInt(x.fund_id) !== options.fundId) continue;
      if (options.accountId && toInt(x.account_id) !== options.accountId) continue;
      const k = keyFor(toInt(x.account_id), toInt(x.fund_id), x.ministry_id === null ? null : toInt(x.ministry_id), 0);
      if (k) slot(k.key, k.label, k.code).cell.committed += toInt(x.amount);
    }
  }
  const approvedUnpaid = await selectOne<any>(
    t,
    `SELECT COALESCE(SUM(total_minor - paid_minor), 0) AS n FROM bills WHERE church_id = :churchId AND status IN ('APPROVED','PARTIALLY_PAID') AND bill_date >= :start AND bill_date <= :end`,
    { churchId, start: year.start, end: year.end }
  );

  const out = [...rows.entries()]
    .sort((a, b) => (a[1].code ?? a[0]).localeCompare(b[1].code ?? b[0]))
    .map(([key, r]) => {
      const c = r.cell;
      const net = { budget: c.budgetIncome - c.budgetExpense, actual: c.actualIncome - c.actualExpense };
      return {
        key, code: r.code ?? null, label: r.label,
        income: { budget: fromMinor(c.budgetIncome), actual: fromMinor(c.actualIncome), variance: fromMinor(c.actualIncome - c.budgetIncome) },
        expense: {
          budget: fromMinor(c.budgetExpense), actual: fromMinor(c.actualExpense), committed: fromMinor(c.committed),
          remaining: fromMinor(c.budgetExpense - c.actualExpense - c.committed), variance: fromMinor(c.budgetExpense - c.actualExpense),
          usedPercent: c.budgetExpense > 0 ? Math.round((c.actualExpense / c.budgetExpense) * 1000) / 10 : null
        },
        net: { budget: fromMinor(net.budget), actual: fromMinor(net.actual), variance: fromMinor(net.actual - net.budget) }
      };
    });
  const total = [...rows.values()].reduce((s, r) => {
    for (const k of Object.keys(s) as Array<keyof Cell>) s[k] += r.cell[k];
    return s;
  }, blank());
  return {
    budget, groupBy: options.groupBy, throughMonth: through, rows: out,
    totals: {
      income: { budget: fromMinor(total.budgetIncome), actual: fromMinor(total.actualIncome), variance: fromMinor(total.actualIncome - total.budgetIncome) },
      expense: { budget: fromMinor(total.budgetExpense), actual: fromMinor(total.actualExpense), committed: fromMinor(total.committed), variance: fromMinor(total.budgetExpense - total.actualExpense) },
      net: { budget: fromMinor(total.budgetIncome - total.budgetExpense), actual: fromMinor(total.actualIncome - total.actualExpense) },
      approvedUnpaid: fromMinor(approvedUnpaid?.n)
    }
  };
}

export interface BudgetCheck {
  hasBudget: boolean;
  budgetId?: number;
  budgeted: number;
  actual: number;
  committed: number;
  remaining: number;
  exceeded: boolean;
  warning: string | null;
}

/**
 * Advisory only. Answers "does this spend still fit the budget for this account and fund?" for
 * the year containing `date`, counting what is already posted plus bills awaiting approval.
 */
export async function checkBudget(
  t: Transaction,
  churchId: number,
  input: { accountId: number; fundId: number; amountMinor: number; date: string; excludeBillId?: number }
): Promise<BudgetCheck> {
  const none: BudgetCheck = { hasBudget: false, budgeted: 0, actual: 0, committed: 0, remaining: 0, exceeded: false, warning: null };
  const year = await selectOne<any>(t, `SELECT id, start_date FROM fiscal_years WHERE church_id = :churchId AND start_date <= :date AND end_date >= :date`, { churchId, date: input.date });
  if (!year) return none;
  const budget = await selectOne<any>(
    t,
    `SELECT id FROM budgets WHERE church_id = :churchId AND fiscal_year_id = :y AND status IN ('ACTIVE','APPROVED') ORDER BY (status = 'ACTIVE') DESC, id DESC LIMIT 1`,
    { churchId, y: toInt(year.id) }
  );
  if (!budget) return none;
  const budgeted = toInt(
    (await selectOne<any>(t, `SELECT COALESCE(SUM(amount_minor), 0) AS n FROM budget_lines WHERE church_id = :churchId AND budget_id = :b AND account_id = :a AND fund_id = :f`, { churchId, b: toInt(budget.id), a: input.accountId, f: input.fundId }))?.n
  );
  const balances = await balancesBetween(t, churchId, { from: dateOnly(year.start_date), to: input.date, fundId: input.fundId });
  const actual = balances.filter((b) => b.accountId === input.accountId).reduce((s, b) => s + b.debit - b.credit, 0);
  const committed = toInt(
    (await selectOne<any>(
      t,
      `SELECT COALESCE(SUM(bl.amount_minor), 0) AS n FROM bill_lines bl JOIN bills b ON b.church_id = bl.church_id AND b.id = bl.bill_id
        WHERE bl.church_id = :churchId AND b.status = 'SUBMITTED' AND bl.account_id = :a AND bl.fund_id = :f AND b.bill_date >= :start ${input.excludeBillId ? 'AND b.id <> :exclude' : ''}`,
      { churchId, a: input.accountId, f: input.fundId, start: dateOnly(year.start_date), exclude: input.excludeBillId }
    ))?.n
  );
  const remaining = budgeted - actual - committed;
  const exceeded = input.amountMinor > remaining;
  let warning: string | null = null;
  if (budgeted === 0) warning = 'no budget has been set for this account and fund';
  else if (exceeded) warning = `this spend of ${fromMinor(input.amountMinor)} exceeds the remaining budget of ${fromMinor(Math.max(remaining, 0))}`;
  return { hasBudget: true, budgetId: toInt(budget.id), budgeted, actual, committed, remaining, exceeded, warning };
}

