import { http } from './http';

export type BudgetStatus = 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'CLOSED';

export interface BudgetSummary {
  id: number;
  fiscalYearId: number;
  name: string;
  status: BudgetStatus;
  notes: string | null;
  createdBy: number;
  approvedBy: number | null;
  approvedAt: string | null;
  activatedAt: string | null;
  totalIncome: string;
  totalExpense: string;
}

export interface BudgetLine {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  fundId: number;
  fundCode: string;
  ministryId: number | null;
  months: string[];
  annual: string;
}

export interface Budget extends Omit<BudgetSummary, 'totalIncome' | 'totalExpense'> {
  lines: BudgetLine[];
}

export interface VarianceSide {
  budget: string;
  actual: string;
  variance: string;
}

export interface VarianceRow {
  key: string;
  code: string | null;
  label: string;
  income: VarianceSide;
  expense: VarianceSide & { committed: string; remaining: string; usedPercent: number | string | null };
  net: VarianceSide;
}

export interface Variance {
  budget: Omit<Budget, 'lines'>;
  groupBy: string;
  throughMonth: number;
  rows: VarianceRow[];
  totals?: Record<string, unknown>;
}

export interface BudgetLineInput {
  accountId: number;
  fundId: number;
  ministryId?: number | null;
  months?: string[];
  annual?: string;
}

export const listBudgets = (fiscalYearId?: number) => http.get<BudgetSummary[]>('/budgets', { fiscalYearId });
export const getBudget = (id: number) => http.get<Budget>(`/budgets/${id}`);
export const createBudget = (body: { fiscalYearId: number; name: string; notes?: string | null; lines?: BudgetLineInput[] }) => http.post<Budget>('/budgets', body);
export const updateBudget = (id: number, body: { name?: string; notes?: string | null; lines?: BudgetLineInput[]; mode?: 'replace' | 'merge' }) => http.put<Budget>(`/budgets/${id}`, body);
export const deleteBudget = (id: number) => http.delete(`/budgets/${id}`);
export const approveBudget = (id: number) => http.post<Budget>(`/budgets/${id}/approve`);
export const activateBudget = (id: number) => http.post<Budget>(`/budgets/${id}/activate`);
export const closeBudget = (id: number) => http.post<Budget>(`/budgets/${id}/close`);
export const copyBudget = (id: number, body: { fiscalYearId: number; name: string; upliftPercent: number }) => http.post<Budget>(`/budgets/${id}/copy`, body);
export const getVariance = (id: number, query: { groupBy?: string; throughMonth?: number; fundId?: number; accountId?: number }) => http.get<Variance>(`/budgets/${id}/variance`, query);

export interface BudgetCheck {
  hasBudget: boolean;
  budgeted: number;
  actual: number;
  committed: number;
  remaining: number;
  exceeded: boolean;
  warning: string | null;
}
/** Would this spend fit what is left of the budget for the account and fund? Amounts in minor units in the answer. */
export const checkBudget = (q: { accountId: number; fundId: number; amount: string; date: string }) => http.get<BudgetCheck>('/budgets/check', q);
