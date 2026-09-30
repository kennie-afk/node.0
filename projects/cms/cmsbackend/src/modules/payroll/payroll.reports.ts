import { Transaction } from 'sequelize';
import { select, selectOne } from '../finance/sql';
import { fromMinor, toInt } from '../../common/money';
import { NotFoundError } from '../../utils/errors';
import { CsvColumn, toCsv } from '../reports/csv';
import { loadRun, mapRun, lastDay } from './runs.service';
import { parseJson } from './employees.service';
import { rateSetFor } from './rates';

const pad = (n: number) => String(n).padStart(2, '0');

function slipDto(s: any) {
  const m = (v: unknown) => fromMinor(toInt(v));
  return {
    id: toInt(s.id),
    employeeId: toInt(s.employee_id),
    employeeName: s.employee_name as string,
    kraPin: s.kra_pin as string | null,
    nssfNo: s.nssf_no as string | null,
    shifNo: s.shif_no as string | null,
    fundId: toInt(s.fund_id),
    ministryId: s.ministry_id === null ? null : toInt(s.ministry_id),
    payMethod: s.pay_method as string,
    payTo: s.pay_to as string | null,
    basic: m(s.basic_minor),
    taxableAllowances: m(s.taxable_allowances_minor),
    nonTaxableAllowances: m(s.non_taxable_allowances_minor),
    gross: m(s.gross_minor),
    nssfEmployee: m(s.nssf_employee_minor),
    nssfEmployer: m(s.nssf_employer_minor),
    shif: m(s.shif_minor),
    housingLevyEmployee: m(s.housing_employee_minor),
    housingLevyEmployer: m(s.housing_employer_minor),
    taxablePay: m(s.taxable_pay_minor),
    payeBeforeRelief: m(s.paye_before_relief_minor),
    personalRelief: m(s.personal_relief_minor),
    insuranceRelief: m(s.insurance_relief_minor),
    paye: m(s.paye_minor),
    otherDeductions: m(s.other_deductions_minor),
    advanceRecovery: m(s.advance_recovery_minor),
    net: m(s.net_minor)
  };
}

export async function runDetail(t: Transaction, churchId: number, id: number) {
  const run = await loadRun(t, churchId, id);
  const slips = await select<any>(t, `SELECT * FROM payslips WHERE church_id = :churchId AND run_id = :id ORDER BY employee_name, id`, { churchId, id });
  const remittances = await select<any>(t, `SELECT kind, amount_minor, paid_date, reference, entry_id FROM statutory_remittances WHERE church_id = :churchId AND run_id = :id`, { churchId, id });
  return {
    ...mapRun(run),
    payslips: slips.map(slipDto),
    remittances: remittances.map((r) => ({ kind: r.kind as string, amount: fromMinor(r.amount_minor), paidDate: String(r.paid_date).slice(0, 10), reference: r.reference as string | null, entryId: toInt(r.entry_id) }))
  };
}

/** Everything a printable payslip needs, including the employee's year-to-date totals. */
export async function payslipDocument(t: Transaction, churchId: number, runId: number, employeeId: number) {
  const run = await loadRun(t, churchId, runId);
  const slip = await selectOne<any>(t, `SELECT * FROM payslips WHERE church_id = :churchId AND run_id = :runId AND employee_id = :employeeId`, { churchId, runId, employeeId });
  if (!slip) throw new NotFoundError('that employee has no payslip in this run');
  const church = await selectOne<any>(t, `SELECT name FROM churches WHERE id = :churchId`, { churchId });
  const year = toInt(run.year);
  const month = toInt(run.month);
  const ytd = await selectOne<any>(
    t,
    `SELECT COALESCE(SUM(p.gross_minor),0) AS gross, COALESCE(SUM(p.paye_minor),0) AS paye, COALESCE(SUM(p.nssf_employee_minor),0) AS nssf,
            COALESCE(SUM(p.shif_minor),0) AS shif, COALESCE(SUM(p.housing_employee_minor),0) AS housing, COALESCE(SUM(p.net_minor),0) AS net
       FROM payslips p JOIN payroll_runs r ON r.church_id = p.church_id AND r.id = p.run_id
      WHERE p.church_id = :churchId AND p.employee_id = :employeeId AND r.year = :year AND r.month <= :month AND r.status <> 'VOID'`,
    { churchId, employeeId, year, month }
  );
  const detail = parseJson<any>(slip.detail, {});
  const set = rateSetFor(year, month);
  return {
    employer: church?.name ?? '',
    period: `${year}-${pad(month)}`,
    periodEnd: lastDay(year, month),
    runStatus: run.status as string,
    rateVersion: set.version,
    employee: { id: employeeId, name: slip.employee_name as string, jobTitle: (detail.jobTitle as string) ?? null, kraPin: slip.kra_pin as string | null, nssfNo: slip.nssf_no as string | null, shifNo: slip.shif_no as string | null },
    earnings: [
      { label: 'Basic salary', amount: fromMinor(slip.basic_minor) },
      ...(detail.allowances ?? []).map((a: any) => ({ label: `${a.name}${a.taxable ? '' : ' (non-taxable)'}`, amount: fromMinor(a.amountMinor) }))
    ],
    gross: fromMinor(slip.gross_minor),
    deductions: [
      { label: 'NSSF', amount: fromMinor(slip.nssf_employee_minor) },
      { label: 'SHIF', amount: fromMinor(slip.shif_minor) },
      { label: 'Affordable housing levy', amount: fromMinor(slip.housing_employee_minor) },
      { label: 'PAYE', amount: fromMinor(slip.paye_minor) },
      ...(detail.deductions ?? []).map((d: any) => ({ label: d.name as string, amount: fromMinor(d.amountMinor) })),
      ...(toInt(slip.advance_recovery_minor) > 0 ? [{ label: 'Staff advance recovery', amount: fromMinor(slip.advance_recovery_minor) }] : [])
    ],
    taxComputation: {
      taxablePay: fromMinor(slip.taxable_pay_minor),
      taxBeforeRelief: fromMinor(slip.paye_before_relief_minor),
      personalRelief: fromMinor(slip.personal_relief_minor),
      insuranceRelief: fromMinor(slip.insurance_relief_minor),
      paye: fromMinor(slip.paye_minor)
    },
    employerContributions: [
      { label: 'NSSF (employer)', amount: fromMinor(slip.nssf_employer_minor) },
      { label: 'Affordable housing levy (employer)', amount: fromMinor(slip.housing_employer_minor) }
    ],
    net: fromMinor(slip.net_minor),
    payMethod: slip.pay_method as string,
    payTo: slip.pay_to as string | null,
    yearToDate: { gross: fromMinor(ytd.gross), paye: fromMinor(ytd.paye), nssf: fromMinor(ytd.nssf), shif: fromMinor(ytd.shif), housingLevy: fromMinor(ytd.housing), net: fromMinor(ytd.net) }
  };
}

export async function registerCsv(t: Transaction, churchId: number, runId: number) {
  const detail = await runDetail(t, churchId, runId);
  const columns: CsvColumn<(typeof detail.payslips)[number]>[] = [
    { header: 'Employee', value: (s) => s.employeeName },
    { header: 'KRA PIN', value: (s) => s.kraPin },
    { header: 'Basic', value: (s) => s.basic },
    { header: 'Allowances', value: (s) => fromMinor(Math.round((Number(s.taxableAllowances) + Number(s.nonTaxableAllowances)) * 100)) },
    { header: 'Gross', value: (s) => s.gross },
    { header: 'NSSF', value: (s) => s.nssfEmployee },
    { header: 'SHIF', value: (s) => s.shif },
    { header: 'Housing levy', value: (s) => s.housingLevyEmployee },
    { header: 'Taxable pay', value: (s) => s.taxablePay },
    { header: 'PAYE', value: (s) => s.paye },
    { header: 'Other deductions', value: (s) => s.otherDeductions },
    { header: 'Advance recovery', value: (s) => s.advanceRecovery },
    { header: 'Net pay', value: (s) => s.net }
  ];
  return { filename: `payroll-register-${detail.year}-${pad(detail.month)}.csv`, body: toCsv(columns, detail.payslips) };
}

/** A payment instruction file for the bank or an M-Pesa bulk upload. It is data; nothing is sent. */
export async function paymentFileCsv(t: Transaction, churchId: number, runId: number) {
  const detail = await runDetail(t, churchId, runId);
  const columns: CsvColumn<(typeof detail.payslips)[number]>[] = [
    { header: 'Employee', value: (s) => s.employeeName },
    { header: 'Method', value: (s) => s.payMethod },
    { header: 'Pay to', value: (s) => s.payTo },
    { header: 'Amount', value: (s) => s.net },
    { header: 'Reference', value: () => `SALARY ${detail.year}-${pad(detail.month)}` }
  ];
  return { filename: `salary-payments-${detail.year}-${pad(detail.month)}.csv`, body: toCsv(columns, detail.payslips.filter((s) => Number(s.net) > 0)) };
}

/** P10-style return data: PAYE by employee and the four monthly statutory totals with due date. */
export async function statutoryReturn(t: Transaction, churchId: number, runId: number) {
  const detail = await runDetail(t, churchId, runId);
  const sum = (pick: (s: (typeof detail.payslips)[number]) => string) => fromMinor(detail.payslips.reduce((acc, s) => acc + Math.round(Number(pick(s)) * 100), 0));
  const nextMonth = detail.month === 12 ? { y: detail.year + 1, m: 1 } : { y: detail.year, m: detail.month + 1 };
  const remitted = new Map(detail.remittances.map((r) => [r.kind, r]));
  const item = (kind: string, amount: string) => ({ kind, amount, dueDate: `${nextMonth.y}-${pad(nextMonth.m)}-09`, remitted: remitted.has(kind), paidDate: remitted.get(kind)?.paidDate ?? null });
  return {
    period: `${detail.year}-${pad(detail.month)}`,
    status: detail.status,
    employees: detail.payslips.map((s) => ({ name: s.employeeName, kraPin: s.kraPin, nssfNo: s.nssfNo, shifNo: s.shifNo, gross: s.gross, taxablePay: s.taxablePay, paye: s.paye, nssfEmployee: s.nssfEmployee, nssfEmployer: s.nssfEmployer, shif: s.shif, housingLevyEmployee: s.housingLevyEmployee, housingLevyEmployer: s.housingLevyEmployer })),
    totals: [
      item('PAYE', sum((s) => s.paye)),
      item('NSSF', sum((s) => fromMinor(Math.round((Number(s.nssfEmployee) + Number(s.nssfEmployer)) * 100)))),
      item('SHIF', sum((s) => s.shif)),
      item('HOUSING_LEVY', sum((s) => fromMinor(Math.round((Number(s.housingLevyEmployee) + Number(s.housingLevyEmployer)) * 100))))
    ]
  };
}

export async function statutoryCsv(t: Transaction, churchId: number, runId: number) {
  const ret = await statutoryReturn(t, churchId, runId);
  const columns: CsvColumn<(typeof ret.employees)[number]>[] = [
    { header: 'Employee', value: (e) => e.name },
    { header: 'KRA PIN', value: (e) => e.kraPin },
    { header: 'NSSF No', value: (e) => e.nssfNo },
    { header: 'SHIF No', value: (e) => e.shifNo },
    { header: 'Gross', value: (e) => e.gross },
    { header: 'Taxable pay', value: (e) => e.taxablePay },
    { header: 'PAYE', value: (e) => e.paye },
    { header: 'NSSF employee', value: (e) => e.nssfEmployee },
    { header: 'NSSF employer', value: (e) => e.nssfEmployer },
    { header: 'SHIF', value: (e) => e.shif },
    { header: 'AHL employee', value: (e) => e.housingLevyEmployee },
    { header: 'AHL employer', value: (e) => e.housingLevyEmployer }
  ];
  return { filename: `statutory-${ret.period}.csv`, body: toCsv(columns, ret.employees) };
}

/** Twelve-month view of what was owed and what has been remitted, for the year. */
export async function statutorySummary(t: Transaction, churchId: number, year: number) {
  const rows = await select<any>(
    t,
    `SELECT r.id, r.month, r.status, r.gross_minor, r.paye_minor, r.nssf_employee_minor, r.nssf_employer_minor, r.shif_minor, r.housing_employee_minor, r.housing_employer_minor, r.net_minor,
            (SELECT COUNT(*) FROM statutory_remittances s WHERE s.church_id = r.church_id AND s.run_id = r.id) AS remitted
       FROM payroll_runs r WHERE r.church_id = :churchId AND r.year = :year AND r.status <> 'VOID' ORDER BY r.month`,
    { churchId, year }
  );
  const total = (pick: (r: any) => number) => fromMinor(rows.reduce((s, r) => s + pick(r), 0));
  return {
    year,
    months: rows.map((r) => ({
      runId: toInt(r.id), month: toInt(r.month), status: r.status as string, gross: fromMinor(r.gross_minor), paye: fromMinor(r.paye_minor),
      nssf: fromMinor(toInt(r.nssf_employee_minor) + toInt(r.nssf_employer_minor)), shif: fromMinor(r.shif_minor),
      housingLevy: fromMinor(toInt(r.housing_employee_minor) + toInt(r.housing_employer_minor)), net: fromMinor(r.net_minor), remittedKinds: toInt(r.remitted)
    })),
    totals: {
      gross: total((r) => toInt(r.gross_minor)), paye: total((r) => toInt(r.paye_minor)),
      nssf: total((r) => toInt(r.nssf_employee_minor) + toInt(r.nssf_employer_minor)), shif: total((r) => toInt(r.shif_minor)),
      housingLevy: total((r) => toInt(r.housing_employee_minor) + toInt(r.housing_employer_minor)), net: total((r) => toInt(r.net_minor))
    }
  };
}
