import { http, type KeysetPage } from './http';

export type Restriction = 'UNRESTRICTED' | 'TEMPORARILY_RESTRICTED' | 'PERMANENTLY_RESTRICTED';
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface FinanceSettings {
  baseCurrency: string;
  fiscalYearStartMonth: number;
  approvalThreshold: string;
  dualApprovalThreshold: string;
  requireSeparationOfDuties: boolean;
  allowRestrictedOverspend: boolean;
  receiptPrefix: string;
}

export interface Fund {
  id: number;
  code: string;
  name: string;
  description: string | null;
  restriction: Restriction;
  isActive: boolean;
  position?: string;
}

export interface Account {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  parentId: number | null;
  isPostable: boolean;
  isActive: boolean;
  systemKey: string | null;
  description: string | null;
}

export interface Period {
  id: number;
  fiscalYearId: number;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
}

export interface FiscalYear {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
  periods: Period[];
}

export interface JournalSummary {
  id: number;
  entryNo: number;
  entryDate: string;
  memo: string;
  sourceType: string;
  sourceId: string | null;
  total: string;
  totalMinor: number;
  reversesEntryId: number | null;
  reversedByEntryId: number | null;
  createdBy: number | null;
  postedAt: string;
  hash: string;
}

export interface JournalLine {
  lineNo: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  fundId: number;
  fundCode: string;
  fundName: string;
  debit: string;
  credit: string;
  memberId: number | null;
  ministryId: number | null;
  memo: string | null;
}

export interface JournalEntry extends JournalSummary {
  lines: JournalLine[];
}

export interface RegisterRow {
  lineId: number;
  entryId: number;
  entryNo: number;
  date: string;
  memo: string | null;
  fundId: number;
  debit: string;
  credit: string;
  balance: string;
}

export interface Register {
  account: { id: number; code: string; name: string; type: AccountType };
  openingBalance: string;
  data: RegisterRow[];
  nextCursor: string | null;
  limit: number;
}

export interface TrialBalance {
  asOf: string;
  lines: Array<{ accountId: number; code: string; name: string; type: AccountType; debit: string; credit: string }>;
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
}

export interface AuditEvent {
  seq: number;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  data: Record<string, unknown>;
  occurredAt: string;
  hash: string;
}

export interface IntegrityReport {
  ok: boolean;
  ledger: { ok: boolean; entries: number; lines: number; issues: string[] };
  audit: { ok: boolean; events: number; issues: string[] };
}

export interface JournalFilter {
  from?: string;
  to?: string;
  sourceType?: string;
  accountId?: number | string;
  fundId?: number | string;
  memberId?: number | string;
  q?: string;
}

export interface ManualLineInput {
  accountId: number;
  fundId: number;
  debit?: string;
  credit?: string;
  memo?: string | null;
  memberId?: number | null;
  ministryId?: number | null;
}

export const getSettings = () => http.get<FinanceSettings>('/finance/settings');
export const updateSettings = (body: Partial<FinanceSettings>) => http.put<FinanceSettings>('/finance/settings', body);

export const listFunds = (includeInactive = false) => http.get<Fund[]>('/finance/funds', { includeInactive });
export const createFund = (body: { code: string; name: string; description?: string | null; restriction: Restriction }) => http.post<Fund>('/finance/funds', body);
export const updateFund = (id: number, body: Partial<Pick<Fund, 'name' | 'description' | 'restriction' | 'isActive'>>) => http.put<Fund>(`/finance/funds/${id}`, body);

export const listAccounts = (query: { type?: string; includeInactive?: boolean; postable?: boolean } = {}) => http.get<Account[]>('/finance/accounts', query);
export const createAccount = (body: { code: string; name: string; type: AccountType; parentId?: number | null; isPostable?: boolean; description?: string | null }) => http.post<Account>('/finance/accounts', body);
export const updateAccount = (id: number, body: Partial<Pick<Account, 'name' | 'description' | 'isActive' | 'isPostable'>>) => http.put<Account>(`/finance/accounts/${id}`, body);
export const deleteAccount = (id: number) => http.delete(`/finance/accounts/${id}`);
export const accountRegister = (id: number, query: { from?: string; to?: string; fundId?: number; limit?: number; cursor?: string }) => http.get<Register>(`/finance/accounts/${id}/register`, query);

export const listFiscalYears = () => http.get<FiscalYear[]>('/finance/fiscal-years');
export const closePeriod = (id: number) => http.post<Period>(`/finance/periods/${id}/close`);
export const reopenPeriod = (id: number, reason: string) => http.post<Period>(`/finance/periods/${id}/reopen`, { reason });
export const closeFiscalYear = (id: number) =>
  http.post<{ yearId: number; name: string; closingEntryId: number | null; surplusByFund: Record<string, number>; nextYearId: number }>(`/finance/fiscal-years/${id}/close`);

export const listJournal = (query: JournalFilter & { limit?: number; cursor?: string }) => http.get<KeysetPage<JournalSummary>>('/finance/journal', query as Record<string, string | number>);
export const getJournalEntry = (id: number) => http.get<JournalEntry>(`/finance/journal/${id}`);
export const postJournal = (body: { date: string; memo: string; lines: ManualLineInput[] }, key: string) => http.postIdempotent<JournalEntry>('/finance/journal', body, key);
export const reverseJournal = (id: number, body: { reason: string; date?: string }) => http.post<JournalEntry>(`/finance/journal/${id}/reverse`, body);
export const postTransfer = (body: { date: string; fromFundId: number; toFundId: number; amount: string; memo: string; accountId?: number }, key: string) =>
  http.postIdempotent<JournalEntry>('/finance/transfers', body, key);

export const getTrialBalance = (query: { asOf?: string; fundId?: number }) => http.get<TrialBalance>('/finance/trial-balance', query);
export const getIntegrity = () => http.get<IntegrityReport>('/finance/integrity');
export const listAudit = (query: { entityType?: string; action?: string }) => http.get<KeysetPage<AuditEvent>>('/finance/audit', query);
