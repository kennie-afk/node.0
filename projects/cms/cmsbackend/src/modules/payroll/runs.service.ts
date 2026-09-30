import { Transaction } from 'sequelize';
import { exec, select, selectOne } from '../finance/sql';
import { fromMinor, toInt } from '../../common/money';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../finance/audit.service';
import { postEntry, PostLine, reverseEntry } from '../finance/ledger.service';
import { accountIdByKey, defaultFundId, loadSettings } from '../finance/setup.service';
import { rateSetFor } from './rates';
import { calculatePay } from './statutory';
import { mapEmployee, parseJson } from './employees.service';

export type RunStatus = 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'POSTED' | 'PAID' | 'VOID';
export type RemitKind = 'PAYE' | 'NSSF' | 'SHIF' | 'HOUSING_LEVY';

const pad = (n: number) => String(n).padStart(2, '0');

export function lastDay(year: number, month: number): string {
  return `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
}
const firstDay = (year: number, month: number) => `${year}-${pad(month)}-01`;

export function mapRun(row: any) {
  const m = (v: unknown) => toInt(v);
  return {
    id: toInt(row.id),
    year: toInt(row.year),
    month: toInt(row.month),
    status: row.status as RunStatus,
    rateVersion: row.rate_version as string | null,
    createdBy: row.created_by === null ? null : toInt(row.created_by),
    calculatedBy: row.calculated_by === null ? null : toInt(row.calculated_by),
    approvedBy: row.approved_by === null ? null : toInt(row.approved_by),
    approvedAt: row.approved_at,
    postedEntryId: row.posted_entry_id === null ? null : toInt(row.posted_entry_id),
    paidEntryId: row.paid_entry_id === null ? null : toInt(row.paid_entry_id),
    paidDate: row.paid_date ? String(row.paid_date).slice(0, 10) : null,
    voidReason: row.void_reason as string | null,
    employeeCount: toInt(row.employee_count),
    totals: {
      gross: fromMinor(m(row.gross_minor)),
      paye: fromMinor(m(row.paye_minor)),
      nssfEmployee: fromMinor(m(row.nssf_employee_minor)),
      nssfEmployer: fromMinor(m(row.nssf_employer_minor)),
      shif: fromMinor(m(row.shif_minor)),
      housingLevyEmployee: fromMinor(m(row.housing_employee_minor)),
      housingLevyEmployer: fromMinor(m(row.housing_employer_minor)),
      otherDeductions: fromMinor(m(row.other_deductions_minor)),
      advanceRecovery: fromMinor(m(row.advance_recovery_minor)),
      net: fromMinor(m(row.net_minor))
    }
  };
}

export async function loadRun(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `SELECT * FROM payroll_runs WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`payroll run ${id} was not found`);
  return row;
}

function expect(row: any, ...allowed: RunStatus[]) {
  if (!allowed.includes(row.status)) {
    throw new ConflictError(`run is ${String(row.status).toLowerCase()}; this needs it to be ${allowed.map((s) => s.toLowerCase()).join(' or ')}`);
  }
}

export async function listRuns(t: Transaction, churchId: number, year?: number) {
  const rows = await select<any>(
    t,
    `SELECT * FROM payroll_runs WHERE church_id = ? ${year ? 'AND year = ?' : ''} ORDER BY year DESC, month DESC, id DESC LIMIT 120`,
    year ? [churchId, year] : [churchId]
  );
  return rows.map(mapRun);
}

export async function createRun(t: Transaction, churchId: number, actorId: number, year: number, month: number) {
  try {
    rateSetFor(year, month); // fails early for months with no recorded rates
  } catch (error) {
    throw new BadRequestError((error as Error).message);
  }
  const live = await selectOne<any>(t, `SELECT id, status FROM payroll_runs WHERE church_id = :churchId AND year = :year AND month = :month AND status <> 'VOID'`, { churchId, year, month });
  if (live) throw new ConflictError(`a payroll run for ${year}-${pad(month)} already exists (#${live.id}, ${String(live.status).toLowerCase()})`);
  await exec(t, `INSERT INTO payroll_runs (church_id, year, month, created_by) VALUES (:churchId, :year, :month, :actorId)`, { churchId, year, month, actorId });
  const row = await selectOne<any>(t, `SELECT * FROM payroll_runs WHERE church_id = :churchId AND year = :year AND month = :month AND status <> 'VOID'`, { churchId, year, month });
  await recordAudit(t, churchId, { action: 'payroll.run.create', entityType: 'payroll_run', entityId: toInt(row.id), actorId, data: { year, month } });
  return mapRun(row);
}

async function advanceRecoveryFor(t: Transaction, churchId: number, employeeId: number): Promise<number> {
  const rows = await select<any>(t, `SELECT amount_minor, monthly_recovery_minor, recovered_minor FROM staff_advances WHERE church_id = :churchId AND employee_id = :employeeId AND status = 'OPEN'`, { churchId, employeeId });
  return rows.reduce((s, a) => s + Math.min(toInt(a.monthly_recovery_minor), toInt(a.amount_minor) - toInt(a.recovered_minor)), 0);
}

/** Works out every payslip for the month. Only a DRAFT run may be (re)calculated. */
export async function calculateRun(t: Transaction, churchId: number, actorId: number, id: number) {
  const run = await loadRun(t, churchId, id);
  expect(run, 'DRAFT');
  const year = toInt(run.year);
  const month = toInt(run.month);
  let set;
  try {
    set = rateSetFor(year, month);
  } catch (error) {
    throw new BadRequestError((error as Error).message);
  }

  const employees = (
    await select<any>(
      t,
      `SELECT * FROM employees WHERE church_id = :churchId AND status = 'ACTIVE' AND start_date <= :last AND (end_date IS NULL OR end_date >= :first) ORDER BY id`,
      { churchId, last: lastDay(year, month), first: firstDay(year, month) }
    )
  ).map(mapEmployee);
  if (employees.length === 0) throw new BadRequestError('there are no active employees to pay for this month');

  await exec(t, `DELETE FROM payslips WHERE church_id = :churchId AND run_id = :id`, { churchId, id });
  const fallbackFund = await defaultFundId(t, churchId);
  const totals = { gross: 0, paye: 0, nssfEe: 0, nssfEr: 0, shif: 0, housEe: 0, housEr: 0, other: 0, advance: 0, net: 0 };

  for (const employee of employees) {
    const advance = await advanceRecoveryFor(t, churchId, employee.id);
    const pay = calculatePay(
      { basicMinor: employee.basicSalaryMinor, allowances: employee.allowances, deductions: employee.deductions, insurancePremiumMinor: employee.insurancePremiumMinor, advanceRecoveryMinor: advance },
      set
    );
    if (pay.netMinor < 0) {
      throw new BadRequestError(`${employee.fullName}: deductions exceed pay by ${fromMinor(-pay.netMinor)}; reduce recurring deductions or the advance recovery`);
    }
    const viaMpesa = !employee.bankAccount && employee.mpesaPhone;
    await exec(
      t,
      `INSERT INTO payslips (church_id, run_id, employee_id, fund_id, ministry_id, employee_name, kra_pin, nssf_no, shif_no, pay_method, pay_to,
          basic_minor, taxable_allowances_minor, non_taxable_allowances_minor, gross_minor, nssf_employee_minor, nssf_employer_minor, shif_minor,
          housing_employee_minor, housing_employer_minor, taxable_pay_minor, paye_before_relief_minor, personal_relief_minor, insurance_relief_minor,
          paye_minor, other_deductions_minor, advance_recovery_minor, net_minor, detail)
       VALUES (:churchId, :id, :employeeId, :fundId, :ministryId, :name, :kra, :nssfNo, :shifNo, :method, :payTo,
          :basic, :taxableAllow, :nonTaxAllow, :gross, :nssfEe, :nssfEr, :shif, :housEe, :housEr, :taxable, :before, :personal, :insurance,
          :paye, :other, :advance, :net, :detail)`,
      {
        churchId,
        id,
        employeeId: employee.id,
        fundId: employee.fundId ?? fallbackFund,
        ministryId: employee.ministryId,
        name: employee.fullName,
        kra: employee.kraPin,
        nssfNo: employee.nssfNo,
        shifNo: employee.shifNo,
        method: viaMpesa ? 'MPESA' : 'BANK',
        payTo: viaMpesa ? employee.mpesaPhone : [employee.bankName, employee.bankAccount].filter(Boolean).join(' ') || null,
        basic: pay.basicMinor,
        taxableAllow: pay.taxableAllowancesMinor,
        nonTaxAllow: pay.nonTaxableAllowancesMinor,
        gross: pay.grossMinor,
        nssfEe: pay.nssfEmployeeMinor,
        nssfEr: pay.nssfEmployerMinor,
        shif: pay.shifMinor,
        housEe: pay.housingLevyEmployeeMinor,
        housEr: pay.housingLevyEmployerMinor,
        taxable: pay.taxablePayMinor,
        before: pay.payeBeforeReliefMinor,
        personal: pay.personalReliefMinor,
        insurance: pay.insuranceReliefMinor,
        paye: pay.payeMinor,
        other: pay.otherDeductionsMinor,
        advance: pay.advanceRecoveryMinor,
        net: pay.netMinor,
        detail: JSON.stringify({
          allowances: employee.allowances.map((a) => ({ name: a.name, amountMinor: a.amountMinor, taxable: a.taxable })),
          deductions: employee.deductions.map((d) => ({ name: d.name, amountMinor: d.amountMinor })),
          jobTitle: employee.jobTitle,
          nssfTier1Minor: pay.nssfTier1Minor,
          nssfTier2Minor: pay.nssfTier2Minor
        })
      }
    );
    totals.gross += pay.grossMinor;
    totals.paye += pay.payeMinor;
    totals.nssfEe += pay.nssfEmployeeMinor;
    totals.nssfEr += pay.nssfEmployerMinor;
    totals.shif += pay.shifMinor;
    totals.housEe += pay.housingLevyEmployeeMinor;
    totals.housEr += pay.housingLevyEmployerMinor;
    totals.other += pay.otherDeductionsMinor;
    totals.advance += pay.advanceRecoveryMinor;
    totals.net += pay.netMinor;
  }

  await exec(
    t,
    `UPDATE payroll_runs SET status = 'CALCULATED', rate_version = :version, calculated_by = :actorId, employee_count = :count,
        gross_minor = :gross, paye_minor = :paye, nssf_employee_minor = :nssfEe, nssf_employer_minor = :nssfEr, shif_minor = :shif,
        housing_employee_minor = :housEe, housing_employer_minor = :housEr, other_deductions_minor = :other, advance_recovery_minor = :advance,
        net_minor = :net, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    { version: set.version, actorId, count: employees.length, ...totals, now: new Date(), churchId, id }
  );
  await recordAudit(t, churchId, { action: 'payroll.run.calculate', entityType: 'payroll_run', entityId: id, actorId, data: { employees: employees.length, rateVersion: set.version, gross: fromMinor(totals.gross), net: fromMinor(totals.net) } });
  return mapRun(await loadRun(t, churchId, id));
}

export async function reopenRun(t: Transaction, churchId: number, actorId: number, id: number) {
  const run = await loadRun(t, churchId, id);
  expect(run, 'CALCULATED');
  await exec(t, `UPDATE payroll_runs SET status = 'DRAFT', updated_at = :now WHERE church_id = :churchId AND id = :id`, { now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'payroll.run.reopen', entityType: 'payroll_run', entityId: id, actorId, data: {} });
  return mapRun(await loadRun(t, churchId, id));
}

/** The person who prepared the figures cannot be the one who approves them (unless the church opted out). */
export async function approveRun(t: Transaction, churchId: number, actorId: number, id: number) {
  const run = await loadRun(t, churchId, id);
  expect(run, 'CALCULATED');
  const settings = await loadSettings(t, churchId);
  if (settings.requireSeparationOfDuties && (actorId === toInt(run.created_by ?? 0) || actorId === toInt(run.calculated_by ?? 0))) {
    throw new ForbiddenError('separation of duties: someone other than the person who prepared this run must approve it');
  }
  await exec(t, `UPDATE payroll_runs SET status = 'APPROVED', approved_by = :actorId, approved_at = :now, updated_at = :now WHERE church_id = :churchId AND id = :id`, { actorId, now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'payroll.run.approve', entityType: 'payroll_run', entityId: id, actorId, data: { net: fromMinor(toInt(run.net_minor)) } });
  return mapRun(await loadRun(t, churchId, id));
}

async function payslipRows(t: Transaction, churchId: number, runId: number) {
  return select<any>(t, `SELECT * FROM payslips WHERE church_id = :churchId AND run_id = :runId ORDER BY employee_name, id`, { churchId, runId });
}

/** Posts the month's payroll to the ledger: expense by fund and ministry, liabilities by fund. */
export async function postRun(t: Transaction, churchId: number, actorId: number, id: number) {
  const run = await loadRun(t, churchId, id);
  expect(run, 'APPROVED');
  const slips = await payslipRows(t, churchId, id);
  const accounts = {
    salaries: await accountIdByKey(t, churchId, 'EXP_SALARIES'),
    allowances: await accountIdByKey(t, churchId, 'EXP_ALLOWANCES'),
    nssfEr: await accountIdByKey(t, churchId, 'EXP_NSSF_EMPLOYER'),
    housingEr: await accountIdByKey(t, churchId, 'EXP_HOUSING_EMPLOYER'),
    paye: await accountIdByKey(t, churchId, 'PAYE_PAYABLE'),
    nssf: await accountIdByKey(t, churchId, 'NSSF_PAYABLE'),
    shif: await accountIdByKey(t, churchId, 'SHIF_PAYABLE'),
    housing: await accountIdByKey(t, churchId, 'HOUSING_LEVY_PAYABLE'),
    deductions: await accountIdByKey(t, churchId, 'PAYROLL_DEDUCTIONS_PAYABLE'),
    advances: await accountIdByKey(t, churchId, 'STAFF_ADVANCES'),
    netPayable: await accountIdByKey(t, churchId, 'SALARIES_PAYABLE')
  };

  // Each fund's lines must balance on their own, so everything is built per fund.
  const funds = new Map<number, { debits: Map<string, { ministryId: number | null; basic: number; allowances: number; nssfEr: number; housEr: number }>; credit: Record<string, number> }>();
  for (const slip of slips) {
    const fundId = toInt(slip.fund_id);
    const fund = funds.get(fundId) ?? { debits: new Map(), credit: { paye: 0, nssf: 0, shif: 0, housing: 0, other: 0, advance: 0, net: 0 } };
    const ministryId = slip.ministry_id === null ? null : toInt(slip.ministry_id);
    const key = String(ministryId);
    const d = fund.debits.get(key) ?? { ministryId, basic: 0, allowances: 0, nssfEr: 0, housEr: 0 };
    d.basic += toInt(slip.basic_minor);
    d.allowances += toInt(slip.taxable_allowances_minor) + toInt(slip.non_taxable_allowances_minor);
    d.nssfEr += toInt(slip.nssf_employer_minor);
    d.housEr += toInt(slip.housing_employer_minor);
    fund.debits.set(key, d);
    fund.credit.paye += toInt(slip.paye_minor);
    fund.credit.nssf += toInt(slip.nssf_employee_minor) + toInt(slip.nssf_employer_minor);
    fund.credit.shif += toInt(slip.shif_minor);
    fund.credit.housing += toInt(slip.housing_employee_minor) + toInt(slip.housing_employer_minor);
    fund.credit.other += toInt(slip.other_deductions_minor);
    fund.credit.advance += toInt(slip.advance_recovery_minor);
    fund.credit.net += toInt(slip.net_minor);
    funds.set(fundId, fund);
  }

  const lines: PostLine[] = [];
  for (const [fundId, fund] of funds) {
    for (const d of fund.debits.values()) {
      const push = (accountId: number, debit: number, memo: string) => {
        if (debit > 0) lines.push({ accountId, fundId, debit, ministryId: d.ministryId, memo });
      };
      push(accounts.salaries, d.basic, 'Basic salaries');
      push(accounts.allowances, d.allowances, 'Allowances');
      push(accounts.nssfEr, d.nssfEr, 'Employer NSSF');
      push(accounts.housingEr, d.housEr, 'Employer housing levy');
    }
    const credit = (accountId: number, amount: number, memo: string) => {
      if (amount > 0) lines.push({ accountId, fundId, credit: amount, memo });
    };
    credit(accounts.paye, fund.credit.paye, 'PAYE');
    credit(accounts.nssf, fund.credit.nssf, 'NSSF');
    credit(accounts.shif, fund.credit.shif, 'SHIF');
    credit(accounts.housing, fund.credit.housing, 'Affordable housing levy');
    credit(accounts.deductions, fund.credit.other, 'Other deductions');
    credit(accounts.advances, fund.credit.advance, 'Staff advance recovery');
    credit(accounts.netPayable, fund.credit.net, 'Net salaries');
  }

  const year = toInt(run.year);
  const month = toInt(run.month);
  const posted = await postEntry(
    { entryDate: lastDay(year, month), memo: `Payroll ${year}-${pad(month)}`, sourceType: 'PAYROLL', sourceId: id, lines, actorId, idempotencyKey: `payroll-post-${churchId}-${id}` },
    t,
    churchId
  );

  // Apply the recoveries to the advances, oldest first, and remember exactly what was taken so a
  // void can give it back.
  for (const slip of slips) {
    let remaining = toInt(slip.advance_recovery_minor);
    if (remaining === 0) continue;
    const open = await select<any>(t, `SELECT id, amount_minor, recovered_minor FROM staff_advances WHERE church_id = :churchId AND employee_id = :employeeId AND status = 'OPEN' ORDER BY id`, { churchId, employeeId: toInt(slip.employee_id) });
    const allocations: Array<{ advanceId: number; amountMinor: number }> = [];
    for (const advance of open) {
      if (remaining === 0) break;
      const take = Math.min(remaining, toInt(advance.amount_minor) - toInt(advance.recovered_minor));
      if (take <= 0) continue;
      const recovered = toInt(advance.recovered_minor) + take;
      await exec(t, `UPDATE staff_advances SET recovered_minor = :recovered, status = :status, updated_at = :now WHERE church_id = :churchId AND id = :id`, {
        recovered,
        status: recovered >= toInt(advance.amount_minor) ? 'CLEARED' : 'OPEN',
        now: new Date(),
        churchId,
        id: toInt(advance.id)
      });
      allocations.push({ advanceId: toInt(advance.id), amountMinor: take });
      remaining -= take;
    }
    const detail = parseJson<Record<string, unknown>>(slip.detail, {});
    await exec(t, `UPDATE payslips SET detail = :detail WHERE church_id = :churchId AND id = :id`, { detail: JSON.stringify({ ...detail, advanceAllocations: allocations }), churchId, id: toInt(slip.id) });
  }

  await exec(t, `UPDATE payroll_runs SET status = 'POSTED', posted_entry_id = :entry, updated_at = :now WHERE church_id = :churchId AND id = :id`, { entry: posted.id, now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'payroll.run.post', entityType: 'payroll_run', entityId: id, actorId, data: { entryId: posted.id, entryNo: posted.entryNo } });
  return mapRun(await loadRun(t, churchId, id));
}

function groupByFund(slips: any[], pick: (slip: any) => number): Map<number, number> {
  const out = new Map<number, number>();
  for (const slip of slips) out.set(toInt(slip.fund_id), (out.get(toInt(slip.fund_id)) ?? 0) + pick(slip));
  return out;
}

async function payFromBank(t: Transaction, churchId: number, accountId?: number) {
  const id = accountId ?? (await accountIdByKey(t, churchId, 'BANK_MAIN'));
  const row = await selectOne<any>(t, `SELECT id, type FROM accounts WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row || row.type !== 'ASSET') throw new BadRequestError('payments must come from an asset (bank, cash or M-Pesa) account');
  return id;
}

/** Pays the net salaries. Records the payment; no money is moved by this system. */
export async function payRun(t: Transaction, churchId: number, actorId: number, id: number, input: { date: string; accountId?: number; reference?: string }) {
  const run = await loadRun(t, churchId, id);
  expect(run, 'POSTED');
  const bank = await payFromBank(t, churchId, input.accountId);
  const netPayable = await accountIdByKey(t, churchId, 'SALARIES_PAYABLE');
  const byFund = groupByFund(await payslipRows(t, churchId, id), (s) => toInt(s.net_minor));
  const lines: PostLine[] = [];
  for (const [fundId, amount] of byFund) {
    if (amount <= 0) continue;
    lines.push({ accountId: netPayable, fundId, debit: amount, memo: 'Net salaries paid' }, { accountId: bank, fundId, credit: amount, memo: input.reference ?? null });
  }
  const posted = await postEntry(
    { entryDate: input.date, memo: `Salaries paid ${toInt(run.year)}-${pad(toInt(run.month))}`, sourceType: 'PAYROLL_PAY', sourceId: id, lines, actorId, idempotencyKey: `payroll-pay-${churchId}-${id}` },
    t,
    churchId
  );
  await exec(t, `UPDATE payroll_runs SET status = 'PAID', paid_entry_id = :entry, paid_date = :date, updated_at = :now WHERE church_id = :churchId AND id = :id`, { entry: posted.id, date: input.date, now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'payroll.run.pay', entityType: 'payroll_run', entityId: id, actorId, data: { entryId: posted.id, reference: input.reference ?? '' } });
  return mapRun(await loadRun(t, churchId, id));
}

const REMIT: Record<RemitKind, { key: string; pick: (s: any) => number; label: string }> = {
  PAYE: { key: 'PAYE_PAYABLE', pick: (s) => toInt(s.paye_minor), label: 'PAYE to KRA' },
  NSSF: { key: 'NSSF_PAYABLE', pick: (s) => toInt(s.nssf_employee_minor) + toInt(s.nssf_employer_minor), label: 'NSSF' },
  SHIF: { key: 'SHIF_PAYABLE', pick: (s) => toInt(s.shif_minor), label: 'SHIF to SHA' },
  HOUSING_LEVY: { key: 'HOUSING_LEVY_PAYABLE', pick: (s) => toInt(s.housing_employee_minor) + toInt(s.housing_employer_minor), label: 'Affordable housing levy to KRA' }
};

export async function remit(t: Transaction, churchId: number, actorId: number, id: number, kind: RemitKind, input: { date: string; accountId?: number; reference?: string }) {
  const run = await loadRun(t, churchId, id);
  expect(run, 'POSTED', 'PAID');
  const already = await selectOne(t, `SELECT id FROM statutory_remittances WHERE church_id = :churchId AND run_id = :id AND kind = :kind`, { churchId, id, kind });
  if (already) throw new ConflictError(`${kind} for this run has already been remitted`);
  const spec = REMIT[kind];
  const bank = await payFromBank(t, churchId, input.accountId);
  const payable = await accountIdByKey(t, churchId, spec.key);
  const byFund = groupByFund(await payslipRows(t, churchId, id), spec.pick);
  const lines: PostLine[] = [];
  let total = 0;
  for (const [fundId, amount] of byFund) {
    if (amount <= 0) continue;
    total += amount;
    lines.push({ accountId: payable, fundId, debit: amount, memo: spec.label }, { accountId: bank, fundId, credit: amount, memo: input.reference ?? null });
  }
  if (total === 0) throw new BadRequestError(`nothing is owed for ${kind} on this run`);
  const posted = await postEntry(
    { entryDate: input.date, memo: `${spec.label} ${toInt(run.year)}-${pad(toInt(run.month))}`, sourceType: 'PAYROLL_REMIT', sourceId: `${id}:${kind}`, lines, actorId, idempotencyKey: `payroll-remit-${churchId}-${id}-${kind}` },
    t,
    churchId
  );
  await exec(t, `INSERT INTO statutory_remittances (church_id, run_id, kind, amount_minor, paid_date, reference, entry_id, created_by) VALUES (:churchId, :id, :kind, :total, :date, :reference, :entry, :actorId)`, {
    churchId, id, kind, total, date: input.date, reference: input.reference ?? null, entry: posted.id, actorId
  });
  await recordAudit(t, churchId, { action: 'payroll.remit', entityType: 'payroll_run', entityId: id, actorId, data: { kind, amount: fromMinor(total), entryId: posted.id } });
  return { kind, amount: fromMinor(total), entryId: posted.id, paidDate: input.date };
}

/**
 * Voiding before posting just marks the run. After posting, the ledger entries are reversed and
 * the advance recoveries given back, unless statutory remittances have already left the church.
 */
export async function voidRun(t: Transaction, churchId: number, actorId: number, id: number, reason: string, date: string) {
  const run = await loadRun(t, churchId, id);
  expect(run, 'DRAFT', 'CALCULATED', 'APPROVED', 'POSTED', 'PAID');
  if (run.status === 'POSTED' || run.status === 'PAID') {
    const remitted = await selectOne(t, `SELECT id FROM statutory_remittances WHERE church_id = :churchId AND run_id = :id LIMIT 1`, { churchId, id });
    if (remitted) throw new ConflictError('statutory amounts have been remitted for this run; it cannot be voided');
    if (run.paid_entry_id) await reverseEntry(t, churchId, toInt(run.paid_entry_id), { reason: `payroll void: ${reason}`, date, actorId, allowSourced: true });
    await reverseEntry(t, churchId, toInt(run.posted_entry_id), { reason: `payroll void: ${reason}`, date, actorId, allowSourced: true });
    for (const slip of await payslipRows(t, churchId, id)) {
      const detail = parseJson<{ advanceAllocations?: Array<{ advanceId: number; amountMinor: number }> }>(slip.detail, {});
      for (const a of detail.advanceAllocations ?? []) {
        await exec(t, `UPDATE staff_advances SET recovered_minor = recovered_minor - :amount, status = 'OPEN', updated_at = :now WHERE church_id = :churchId AND id = :advanceId`, { amount: a.amountMinor, now: new Date(), churchId, advanceId: a.advanceId });
      }
    }
  }
  await exec(t, `UPDATE payroll_runs SET status = 'VOID', void_reason = :reason, updated_at = :now WHERE church_id = :churchId AND id = :id`, { reason, now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'payroll.run.void', entityType: 'payroll_run', entityId: id, actorId, data: { reason, wasStatus: run.status } });
  return mapRun(await loadRun(t, churchId, id));
}

// ---- staff advances ---------------------------------------------------------------------------

export async function issueAdvance(
  t: Transaction,
  churchId: number,
  actorId: number,
  input: { employeeId: number; amountMinor: number; monthlyRecoveryMinor: number; date: string; accountId?: number; note?: string | null }
) {
  const employee = await selectOne<any>(t, `SELECT * FROM employees WHERE church_id = :churchId AND id = :id`, { churchId, id: input.employeeId });
  if (!employee) throw new NotFoundError(`employee ${input.employeeId} was not found`);
  if (input.monthlyRecoveryMinor > input.amountMinor) throw new BadRequestError('the monthly recovery cannot exceed the advance');
  const bank = await payFromBank(t, churchId, input.accountId);
  const receivable = await accountIdByKey(t, churchId, 'STAFF_ADVANCES');
  const fundId = employee.fund_id === null ? await defaultFundId(t, churchId) : toInt(employee.fund_id);
  const posted = await postEntry(
    {
      entryDate: input.date,
      memo: `Staff advance to ${employee.full_name}`,
      sourceType: 'STAFF_ADVANCE',
      lines: [
        { accountId: receivable, fundId, debit: input.amountMinor, memberId: employee.member_id === null ? null : toInt(employee.member_id) },
        { accountId: bank, fundId, credit: input.amountMinor }
      ],
      actorId
    },
    t,
    churchId
  );
  await exec(
    t,
    `INSERT INTO staff_advances (church_id, employee_id, amount_minor, monthly_recovery_minor, issued_date, entry_id, note) VALUES (:churchId, :employeeId, :amount, :monthly, :date, :entry, :note)`,
    { churchId, employeeId: input.employeeId, amount: input.amountMinor, monthly: input.monthlyRecoveryMinor, date: input.date, entry: posted.id, note: input.note ?? null }
  );
  await recordAudit(t, churchId, { action: 'payroll.advance.issue', entityType: 'employee', entityId: input.employeeId, actorId, data: { amount: fromMinor(input.amountMinor), entryId: posted.id } });
  return (await listAdvances(t, churchId, input.employeeId))[0];
}

export async function listAdvances(t: Transaction, churchId: number, employeeId?: number) {
  const rows = await select<any>(
    t,
    `SELECT a.*, e.full_name FROM staff_advances a JOIN employees e ON e.church_id = a.church_id AND e.id = a.employee_id
      WHERE a.church_id = ? ${employeeId ? 'AND a.employee_id = ?' : ''} ORDER BY a.id DESC LIMIT 200`,
    employeeId ? [churchId, employeeId] : [churchId]
  );
  return rows.map((a) => ({
    id: toInt(a.id),
    employeeId: toInt(a.employee_id),
    employeeName: a.full_name,
    amount: fromMinor(a.amount_minor),
    monthlyRecovery: fromMinor(a.monthly_recovery_minor),
    recovered: fromMinor(a.recovered_minor),
    outstanding: fromMinor(toInt(a.amount_minor) - toInt(a.recovered_minor)),
    status: a.status as string,
    issuedDate: String(a.issued_date).slice(0, 10),
    note: a.note as string | null
  }));
}
