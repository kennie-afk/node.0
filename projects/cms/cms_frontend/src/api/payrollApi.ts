import { http, type KeysetPage, type Query } from './http';

export interface Allowance {
  name: string;
  amount: string;
  taxable: boolean;
}

export interface Deduction {
  name: string;
  amount: string;
}

export interface Employee {
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
  basicSalary: string;
  allowances: Allowance[];
  deductions: Deduction[];
  insurancePremium: string;
  fundId: number | null;
  ministryId: number | null;
  status: 'ACTIVE' | 'INACTIVE';
  startDate: string;
  endDate: string | null;
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
  basicSalary: string;
  allowances?: Allowance[];
  deductions?: Deduction[];
  insurancePremium?: string;
  fundId?: number | null;
  ministryId?: number | null;
  startDate: string;
  endDate?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

export type RunStatus = 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'POSTED' | 'PAID' | 'VOID';

export interface RunTotals {
  gross: string;
  paye: string;
  nssfEmployee: string;
  nssfEmployer: string;
  shif: string;
  housingLevyEmployee: string;
  housingLevyEmployer: string;
  otherDeductions: string;
  advanceRecovery: string;
  net: string;
}

export interface Run {
  id: number;
  year: number;
  month: number;
  status: RunStatus;
  rateVersion: string;
  createdBy: number;
  calculatedBy: number | null;
  approvedBy: number | null;
  approvedAt: string | null;
  postedEntryId: number | null;
  paidEntryId: number | null;
  paidDate: string | null;
  voidReason: string | null;
  employeeCount: number;
  totals: RunTotals;
}

export interface RunPayslip {
  id: number;
  employeeId: number;
  employeeName: string;
  kraPin: string | null;
  basic: string;
  taxableAllowances: string;
  nonTaxableAllowances: string;
  gross: string;
  nssfEmployee: string;
  shif: string;
  housingLevyEmployee: string;
  taxablePay: string;
  payeBeforeRelief: string;
  personalRelief: string;
  insuranceRelief: string;
  paye: string;
  net: string;
  payMethod: string;
  otherDeductions: string;
  advanceRecovery: string;
  nssfEmployer: string;
  housingLevyEmployer: string;
}

export interface RunDetail extends Run {
  payslips: RunPayslip[];
  remittances: Array<{ kind: 'PAYE' | 'NSSF' | 'SHIF' | 'HOUSING_LEVY'; amount: string; paidDate: string; reference: string | null; entryId: number }>;
}

export interface Payslip {
  employer: string;
  period: string;
  periodEnd: string;
  runStatus: RunStatus;
  rateVersion: string;
  employee: { id: number; name: string; jobTitle: string | null; kraPin: string | null; nssfNo: string | null; shifNo: string | null };
  earnings: Array<{ label: string; amount: string }>;
  gross: string;
  deductions: Array<{ label: string; amount: string }>;
  taxComputation: { taxablePay: string; taxBeforeRelief: string; personalRelief: string; insuranceRelief: string; paye: string };
  employerContributions: Array<{ label: string; amount: string }>;
  net: string;
  payMethod: string;
  payTo: string | null;
  yearToDate: { gross: string; paye: string; nssf: string; shif: string; housingLevy: string; net: string };
}

export interface StatutoryReturn {
  period: string;
  status: RunStatus;
  employees: Array<{ name: string; kraPin: string | null; nssfNo: string | null; shifNo: string | null; gross: string; taxablePay: string; paye: string; nssfEmployee: string; nssfEmployer: string; shif: string; housingLevyEmployee: string; housingLevyEmployer: string }>;
  [key: string]: unknown;
}

export interface StatutorySummary {
  year: number;
  months: Array<{ runId: number; month: number; status: RunStatus; gross: string; paye: string; nssf: string; shif: string; housingLevy: string; net: string; remittedKinds: number }>;
  totals: { gross: string; paye: string; nssf: string; shif: string; housingLevy: string; net: string };
}

export interface RateSource {
  what: string;
  url: string;
  retrieved: string;
  verified: 'official' | 'secondary' | string;
}

export interface RateSet {
  version: string;
  effectiveFrom: string;
  payeBands: Array<{ upTo: string | null; rate: string }>;
  personalRelief: string;
  insuranceRelief: string;
  nssf: { rate: string; lowerLimit: string; upperLimit: string };
  shif: { rate: string; minimum: string };
  housingLevy: { employee: string; employer: string };
  sources: RateSource[];
}

export interface Rates {
  current: RateSet;
  history: RateSet[];
  note: string;
}

export interface Advance {
  id: number;
  employeeId: number;
  [key: string]: unknown;
}

export const getRates = () => http.get<Rates>('/payroll/rates');
export const listEmployees = (query: { status?: string; q?: string }) => http.get<KeysetPage<Employee>>('/payroll/employees', query as Query);
export const getEmployee = (id: number) => http.get<Employee>(`/payroll/employees/${id}`);
export const createEmployee = (body: EmployeeInput) => http.post<Employee>('/payroll/employees', body);
export const updateEmployee = (id: number, body: Partial<EmployeeInput>) => http.put<Employee>(`/payroll/employees/${id}`, body);
export const deleteEmployee = (id: number) => http.delete(`/payroll/employees/${id}`);

export const listAdvances = (employeeId?: number) => http.get<Advance[]>('/payroll/advances', { employeeId });
export const createAdvance = (body: { employeeId: number; amount: string; monthlyRecovery: string; date: string; accountId?: number; note?: string | null }, key: string) =>
  http.postIdempotent<Advance>('/payroll/advances', body, key);

export const listRuns = (year?: number) => http.get<Run[]>('/payroll/runs', { year });
export const createRun = (body: { year: number; month: number }) => http.post<Run>('/payroll/runs', body);
export const getRun = (id: number) => http.get<RunDetail>(`/payroll/runs/${id}`);
export const calculateRun = (id: number) => http.post<RunDetail>(`/payroll/runs/${id}/calculate`);
export const reopenRun = (id: number) => http.post<RunDetail>(`/payroll/runs/${id}/reopen`);
export const approveRun = (id: number) => http.post<RunDetail>(`/payroll/runs/${id}/approve`);
export const postRun = (id: number) => http.post<RunDetail>(`/payroll/runs/${id}/post`);
export const payRun = (id: number, body: { date: string; accountId?: number; reference?: string }, key: string) => http.postIdempotent<RunDetail>(`/payroll/runs/${id}/pay`, body, key);
export const remitRun = (id: number, body: { kind: 'PAYE' | 'NSSF' | 'SHIF' | 'HOUSING_LEVY'; date: string; accountId?: number; reference?: string }, key: string) =>
  http.postIdempotent<RunDetail>(`/payroll/runs/${id}/remit`, body, key);
export const voidRun = (id: number, reason: string, date?: string) => http.post<RunDetail>(`/payroll/runs/${id}/void`, { reason, date });
export const getPayslip = (runId: number, employeeId: number) => http.get<Payslip>(`/payroll/runs/${runId}/payslips/${employeeId}`);
export const getStatutory = (runId: number) => http.get<StatutoryReturn>(`/payroll/runs/${runId}/statutory`);
export const getStatutorySummary = (year: number) => http.get<StatutorySummary>('/payroll/statutory/summary', { year });
