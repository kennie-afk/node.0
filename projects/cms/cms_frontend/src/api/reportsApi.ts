import axiosInstance from './axiosInstance';
import { http } from './http';

export type RangeQuery = {
  from?: string;
  to?: string;
  yearId?: number | string;
  fundId?: number | string;
};

export interface Dashboard {
  asOf: string;
  fiscalYear: { name: string; start: string; end: string };
  month: { from: string; income: string; expenses: string; surplus: string };
  yearToDate: { from: string; income: string; expenses: string; surplus: string };
  cash: { total: string; accounts: Array<{ accountId: number; code: string; name: string; balance: string }> };
  accountsPayable: string | null;
  bills: { outstanding: string; overdue: string; dueNext7Days: string; overdueCount: number } | null;
  pledges: { activePledges: number; pledged: string; received: string; outstanding: string; campaigns: Array<{ id: number; name: string; goal: string; raised: string; percent: string }> } | null;
  budget: { name: string; budgetedExpensesToDate: string; actualExpensesToDate: string; utilisation: string | null } | null;
  givingTrend: Array<{ month: string; gifts: number; donors: number; total: string }>;
}

export interface StatementLine {
  accountId: number | null;
  code: string;
  name: string;
  amount: string;
  priorAmount?: string;
  change?: string;
}

export interface IncomeStatement {
  from: string;
  to: string;
  fundId: number | null;
  income: StatementLine[];
  expenses: StatementLine[];
  totalIncome: string;
  totalExpenses: string;
  surplus: string;
  prior?: { from: string; to: string; totalIncome: string; totalExpenses: string; surplus: string };
  byFund?: Array<{ fundId: number; code: string; name: string; totalIncome: string; totalExpenses: string; surplus: string }>;
}

export interface BalanceSheet {
  asOf: string;
  fundId: number | null;
  assets: StatementLine[];
  totalAssets: string;
  liabilities: StatementLine[];
  totalLiabilities: string;
  netAssets: StatementLine[];
  totalNetAssets: string;
  balanced: boolean;
  difference: string;
}

export interface CashFlow {
  from: string;
  to: string;
  openingCash: string;
  inflows: Array<{ sourceType: string; label: string; amount: string }>;
  outflows: Array<{ sourceType: string; label: string; amount: string }>;
  netChange: string;
  closingCash: string;
  accounts: Array<{ accountId: number; code: string; name: string; opening: string; closing: string; change: string }>;
  reconciles: boolean;
}

export interface FundBalances {
  asOf: string;
  funds: Array<{ fundId: number; code: string; name: string; restriction: string; cash: string; totalAssets: string; liabilities: string; netAssets: string; unclosedIncome: string; unclosedExpenses: string }>;
  totals?: Record<string, string>;
}

export interface GeneralLedgerSummary {
  from: string;
  to: string;
  accounts: Array<{ accountId: number; code: string; name: string; type: string; opening: string; debits: string; credits: string; closing: string }>;
}

export interface GivingByType { from: string; to: string; total: string; types: Array<{ type: string; gifts: number; donors: number; total: string; share: string }> }
export interface GivingByMonth { from: string; to: string; months: Array<{ month: string; gifts: number; donors: number; total: string }> }
export interface GivingByFund { from: string; to: string; total: string; funds: Array<{ fundId: number; code: string; name: string; restriction: string; income: string }> }
export interface TopGivers { from: string; to: string; givers: Array<{ rank: number; memberId: number; name: string; gifts: number; total: string; lastGift: string }> }
export interface LapsedGivers { asOf: string; quietSince: string; lookbackFrom: string; givers: Array<{ memberId: number; name: string; lastGift: string; gifts?: number; total?: string }> }
export interface Retention { year: number; priorYearDonors: number; currentYearDonors: number; retained: number; lost: number; newDonors: number; retentionRate: number | string | null }
export interface AverageGift { from: string; to: string; gifts: number; identifiedDonors: number; total: string; averageGift: string; averagePerDonor: string }
export interface ExpensesByMinistry { from: string; to: string; total: string; ministries: Array<{ ministryId: number | null; name: string; total: string; share: string; accounts: Array<{ code: string; name: string; amount: string }> }> }

export const getDashboard = () => http.get<Dashboard>('/reports/dashboard');
export const getIncomeStatement = (q: RangeQuery & { compare?: string; byFund?: boolean }) => http.get<IncomeStatement>('/reports/income-statement', { ...q, byFund: q.byFund ? 'true' : undefined });
export const getBalanceSheet = (q: { asOf?: string; fundId?: number | string }) => http.get<BalanceSheet>('/reports/balance-sheet', q);
export const getCashFlow = (q: RangeQuery) => http.get<CashFlow>('/reports/cash-flow', q);
export const getFundBalances = (q: { asOf?: string }) => http.get<FundBalances>('/reports/fund-balances', q);
export const getGeneralLedger = (q: RangeQuery) => http.get<GeneralLedgerSummary>('/reports/general-ledger', q);
export const getExpensesByMinistry = (q: RangeQuery) => http.get<ExpensesByMinistry>('/reports/expenses/by-ministry', q);
export const getGivingByType = (q: RangeQuery) => http.get<GivingByType>('/reports/giving/by-type', q);
export const getGivingByMonth = (q: RangeQuery) => http.get<GivingByMonth>('/reports/giving/by-month', q);
export const getGivingByFund = (q: RangeQuery) => http.get<GivingByFund>('/reports/giving/by-fund', q);
export const getTopGivers = (q: RangeQuery & { limit?: number }) => http.get<TopGivers>('/reports/giving/top-givers', q);
export const getLapsedGivers = (q: { asOf?: string; quietMonths?: number; lookbackMonths?: number }) => http.get<LapsedGivers>('/reports/giving/lapsed', q);
export const getRetention = (year: number) => http.get<Retention>('/reports/giving/retention', { year });
export const getAverageGift = (q: RangeQuery) => http.get<AverageGift>('/reports/giving/average-gift', q);

/** Downloads a report (or payroll export) as a CSV file through the authenticated client. */
export async function downloadCsv(path: string, query: Record<string, string | number | boolean | undefined> = {}, fallbackName = 'report.csv'): Promise<void> {
  const response = await axiosInstance.get<Blob>(path, { params: { ...query, format: path.startsWith('/reports') ? 'csv' : undefined }, responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
