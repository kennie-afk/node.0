import { Transaction } from 'sequelize';
import { exec, select, selectOne } from '../finance/sql';
import { fromMinor, toInt } from '../../common/money';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { recordAudit } from '../finance/audit.service';
import type { Allowance, Deduction } from './statutory';

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export interface EmployeeRow {
  id: number;
  memberId: number | null;
  fullName: string;
  nationalId: string | null;
  kraPin: string | null;
  nssfNo: string | null;
  shifNo: string | null;
  email: string | null;
  phone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  mpesaPhone: string | null;
  jobTitle: string | null;
  basicSalaryMinor: number;
  allowances: Allowance[];
  deductions: Deduction[];
  insurancePremiumMinor: number;
  fundId: number | null;
  ministryId: number | null;
  status: 'ACTIVE' | 'INACTIVE';
  startDate: string;
  endDate: string | null;
}

export function mapEmployee(row: any): EmployeeRow {
  return {
    id: toInt(row.id),
    memberId: row.member_id === null ? null : toInt(row.member_id),
    fullName: row.full_name,
    nationalId: row.national_id,
    kraPin: row.kra_pin,
    nssfNo: row.nssf_no,
    shifNo: row.shif_no,
    email: row.email,
    phone: row.phone,
    bankName: row.bank_name,
    bankAccount: row.bank_account,
    mpesaPhone: row.mpesa_phone,
    jobTitle: row.job_title,
    basicSalaryMinor: toInt(row.basic_salary_minor),
    allowances: parseJson<Allowance[]>(row.allowances, []),
    deductions: parseJson<Deduction[]>(row.deductions, []),
    insurancePremiumMinor: toInt(row.insurance_premium_minor),
    fundId: row.fund_id === null ? null : toInt(row.fund_id),
    ministryId: row.ministry_id === null ? null : toInt(row.ministry_id),
    status: row.status,
    startDate: String(row.start_date).slice(0, 10),
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : null
  };
}

export function employeeDto(e: EmployeeRow) {
  return {
    ...e,
    basicSalary: fromMinor(e.basicSalaryMinor),
    allowances: e.allowances.map((a) => ({ name: a.name, amount: fromMinor(a.amountMinor), taxable: a.taxable })),
    deductions: e.deductions.map((d) => ({ name: d.name, amount: fromMinor(d.amountMinor) })),
    insurancePremium: fromMinor(e.insurancePremiumMinor)
  };
}

export interface EmployeeInput {
  memberId?: number | null;
  fullName: string;
  nationalId?: string | null;
  kraPin?: string | null;
  nssfNo?: string | null;
  shifNo?: string | null;
  email?: string | null;
  phone?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  mpesaPhone?: string | null;
  jobTitle?: string | null;
  basicSalaryMinor: number;
  allowances?: Allowance[];
  deductions?: Deduction[];
  insurancePremiumMinor?: number;
  fundId?: number | null;
  ministryId?: number | null;
  startDate: string;
  endDate?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

async function assertRefs(t: Transaction, churchId: number, input: Partial<EmployeeInput>) {
  const checks: Array<[string, unknown, string]> = [
    ['members', input.memberId, 'member'],
    ['funds', input.fundId, 'fund'],
    ['ministries', input.ministryId, 'ministry']
  ];
  for (const [table, id, label] of checks) {
    if (id === undefined || id === null) continue;
    const found = await selectOne(t, `SELECT id FROM ${table} WHERE church_id = :churchId AND id = :id`, { churchId, id });
    if (!found) throw new BadRequestError(`${label} ${id} does not exist in this church`);
  }
}

export async function listEmployees(t: Transaction, churchId: number, filter: { status?: string; q?: string; limit: number; cursor?: string }) {
  const where = ['church_id = ?'];
  const params: unknown[] = [churchId];
  if (filter.status) {
    where.push('status = ?');
    params.push(filter.status);
  }
  if (filter.q) {
    where.push('(LOWER(full_name) LIKE ? OR kra_pin LIKE ?)');
    const like = `%${filter.q.toLowerCase().replace(/[%_]/g, '')}%`;
    params.push(like, `%${filter.q.toUpperCase().replace(/[%_]/g, '')}%`);
  }
  const cursor = decodeCursor<{ n: string; id: number }>(filter.cursor);
  if (cursor) {
    where.push('(full_name > ? OR (full_name = ? AND id > ?))');
    params.push(cursor.n, cursor.n, cursor.id);
  }
  const rows = await select<any>(t, `SELECT * FROM employees WHERE ${where.join(' AND ')} ORDER BY full_name, id LIMIT ?`, [...params, filter.limit + 1]);
  return toKeysetPage(rows.map((r) => employeeDto(mapEmployee(r))), filter.limit, (e) => ({ n: e.fullName, id: e.id }));
}

export async function getEmployee(t: Transaction, churchId: number, id: number): Promise<EmployeeRow> {
  const row = await selectOne<any>(t, `SELECT * FROM employees WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`employee ${id} was not found`);
  return mapEmployee(row);
}

export async function createEmployee(t: Transaction, churchId: number, actorId: number, input: EmployeeInput): Promise<EmployeeRow> {
  await assertRefs(t, churchId, input);
  if (input.kraPin) {
    const dup = await selectOne(t, `SELECT id FROM employees WHERE church_id = :churchId AND kra_pin = :pin`, { churchId, pin: input.kraPin });
    if (dup) throw new ConflictError(`an employee with KRA PIN ${input.kraPin} already exists`);
  }
  await exec(
    t,
    `INSERT INTO employees (church_id, member_id, full_name, national_id, kra_pin, nssf_no, shif_no, email, phone, bank_name, bank_account, mpesa_phone, job_title,
        basic_salary_minor, allowances, deductions, insurance_premium_minor, fund_id, ministry_id, status, start_date, end_date)
     VALUES (:churchId, :memberId, :fullName, :nationalId, :kraPin, :nssfNo, :shifNo, :email, :phone, :bankName, :bankAccount, :mpesaPhone, :jobTitle,
        :basic, :allowances, :deductions, :insurance, :fundId, :ministryId, :status, :startDate, :endDate)`,
    {
      churchId,
      memberId: input.memberId ?? null,
      fullName: input.fullName,
      nationalId: input.nationalId ?? null,
      kraPin: input.kraPin ?? null,
      nssfNo: input.nssfNo ?? null,
      shifNo: input.shifNo ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      bankName: input.bankName ?? null,
      bankAccount: input.bankAccount ?? null,
      mpesaPhone: input.mpesaPhone ?? null,
      jobTitle: input.jobTitle ?? null,
      basic: input.basicSalaryMinor,
      allowances: JSON.stringify(input.allowances ?? []),
      deductions: JSON.stringify(input.deductions ?? []),
      insurance: input.insurancePremiumMinor ?? 0,
      fundId: input.fundId ?? null,
      ministryId: input.ministryId ?? null,
      status: input.status ?? 'ACTIVE',
      startDate: input.startDate,
      endDate: input.endDate ?? null
    }
  );
  const row = await selectOne<any>(t, `SELECT * FROM employees WHERE church_id = :churchId ORDER BY id DESC LIMIT 1`, { churchId });
  const created = mapEmployee(row);
  await recordAudit(t, churchId, { action: 'employee.create', entityType: 'employee', entityId: created.id, actorId, data: { name: created.fullName } });
  return created;
}

export async function updateEmployee(t: Transaction, churchId: number, actorId: number, id: number, changes: Partial<EmployeeInput>): Promise<EmployeeRow> {
  const current = await getEmployee(t, churchId, id);
  await assertRefs(t, churchId, changes);
  if (changes.kraPin && changes.kraPin !== current.kraPin) {
    const dup = await selectOne(t, `SELECT id FROM employees WHERE church_id = :churchId AND kra_pin = :pin AND id <> :id`, { churchId, pin: changes.kraPin, id });
    if (dup) throw new ConflictError(`an employee with KRA PIN ${changes.kraPin} already exists`);
  }
  const has = (key: keyof EmployeeInput) => Object.prototype.hasOwnProperty.call(changes, key);
  const next = {
    memberId: has('memberId') ? changes.memberId ?? null : current.memberId,
    fullName: changes.fullName ?? current.fullName,
    nationalId: has('nationalId') ? changes.nationalId ?? null : current.nationalId,
    kraPin: has('kraPin') ? changes.kraPin ?? null : current.kraPin,
    nssfNo: has('nssfNo') ? changes.nssfNo ?? null : current.nssfNo,
    shifNo: has('shifNo') ? changes.shifNo ?? null : current.shifNo,
    email: has('email') ? changes.email ?? null : current.email,
    phone: has('phone') ? changes.phone ?? null : current.phone,
    bankName: has('bankName') ? changes.bankName ?? null : current.bankName,
    bankAccount: has('bankAccount') ? changes.bankAccount ?? null : current.bankAccount,
    mpesaPhone: has('mpesaPhone') ? changes.mpesaPhone ?? null : current.mpesaPhone,
    jobTitle: has('jobTitle') ? changes.jobTitle ?? null : current.jobTitle,
    basic: changes.basicSalaryMinor ?? current.basicSalaryMinor,
    allowances: JSON.stringify(changes.allowances ?? current.allowances),
    deductions: JSON.stringify(changes.deductions ?? current.deductions),
    insurance: changes.insurancePremiumMinor ?? current.insurancePremiumMinor,
    fundId: has('fundId') ? changes.fundId ?? null : current.fundId,
    ministryId: has('ministryId') ? changes.ministryId ?? null : current.ministryId,
    status: changes.status ?? current.status,
    startDate: changes.startDate ?? current.startDate,
    endDate: has('endDate') ? changes.endDate ?? null : current.endDate
  };
  await exec(
    t,
    `UPDATE employees SET member_id = :memberId, full_name = :fullName, national_id = :nationalId, kra_pin = :kraPin, nssf_no = :nssfNo, shif_no = :shifNo,
        email = :email, phone = :phone, bank_name = :bankName, bank_account = :bankAccount, mpesa_phone = :mpesaPhone, job_title = :jobTitle,
        basic_salary_minor = :basic, allowances = :allowances, deductions = :deductions, insurance_premium_minor = :insurance,
        fund_id = :fundId, ministry_id = :ministryId, status = :status, start_date = :startDate, end_date = :endDate, updated_at = :now
      WHERE church_id = :churchId AND id = :id`,
    { ...next, now: new Date(), churchId, id }
  );
  // A pay change is sensitive: record who changed it and from what to what.
  const salaryChanged = next.basic !== current.basicSalaryMinor;
  await recordAudit(t, churchId, {
    action: salaryChanged ? 'employee.salary_change' : 'employee.update',
    entityType: 'employee',
    entityId: id,
    actorId,
    data: salaryChanged ? { from: fromMinor(current.basicSalaryMinor), to: fromMinor(next.basic) } : { fields: Object.keys(changes).join(',') }
  });
  return getEmployee(t, churchId, id);
}

/** Employees with payslips are kept for the record and only deactivated. */
export async function removeEmployee(t: Transaction, churchId: number, actorId: number, id: number): Promise<'deleted' | 'deactivated'> {
  const employee = await getEmployee(t, churchId, id);
  const used = await selectOne(t, `SELECT 1 AS x FROM payslips WHERE church_id = :churchId AND employee_id = :id LIMIT 1`, { churchId, id });
  const advances = await selectOne(t, `SELECT 1 AS x FROM staff_advances WHERE church_id = :churchId AND employee_id = :id LIMIT 1`, { churchId, id });
  if (used || advances) {
    await exec(t, `UPDATE employees SET status = 'INACTIVE', end_date = COALESCE(end_date, :today), updated_at = :now WHERE church_id = :churchId AND id = :id`, {
      today: new Date().toISOString().slice(0, 10),
      now: new Date(),
      churchId,
      id
    });
    await recordAudit(t, churchId, { action: 'employee.deactivate', entityType: 'employee', entityId: id, actorId, data: { name: employee.fullName } });
    return 'deactivated';
  }
  await exec(t, `DELETE FROM employees WHERE church_id = :churchId AND id = :id`, { churchId, id });
  await recordAudit(t, churchId, { action: 'employee.delete', entityType: 'employee', entityId: id, actorId, data: { name: employee.fullName } });
  return 'deleted';
}
