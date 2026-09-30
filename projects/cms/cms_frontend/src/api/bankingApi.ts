import { http, type KeysetPage } from './http';

export type BankKind = 'CASH' | 'BANK' | 'MPESA_PAYBILL' | 'MPESA_TILL' | 'PETTY_CASH';

export interface BankAccount {
  id: number;
  name: string;
  kind: BankKind;
  glAccountId: number;
  accountNumber: string | null;
  currency: string;
  float: string | null;
  isActive: boolean;
  ledgerBalance?: string;
}

export interface StatementSummary {
  id: number;
  label: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: string | null;
  closingBalance: string | null;
  source: string;
  lineCount: number;
  importedAt: string;
}

export interface StatementLine {
  id: number;
  bankAccountId: number;
  statementId: number;
  date: string;
  description: string;
  reference: string | null;
  amount: string;
  amountMinor: number;
  status: 'UNMATCHED' | 'MATCHED' | 'IGNORED' | 'RECONCILED';
  ignoreReason: string | null;
  reconciliationId: number | null;
}

export interface LedgerCandidate {
  journalLineId: number;
  entryId: number;
  entryNo: number;
  date: string;
  memo: string | null;
  sourceType: string;
  sourceId: string | null;
  amountMinor: number;
  amount: string;
  score?: number;
}

export interface Unreconciled {
  bankAccount: BankAccount;
  statementLines: StatementLine[];
  ledgerLines: LedgerCandidate[];
  totals: { bankOnly: string; ledgerOnly: string; net: string };
}

export interface MatchProposal {
  lineId: number;
  journalLineId: number;
  score: number;
  unique: boolean;
  applied: boolean;
}

export interface ReconciliationSummary {
  startingBalance: string;
  matchedLedgerTotal: string;
  ignoredTotal: string;
  clearedBalance: string;
  statementBalance: string;
  difference: string;
  unmatchedStatementLines: Array<{ id: number; date: string; description: string; amount: string }>;
  canFinalize: boolean;
}

export interface Reconciliation {
  id: number;
  bankAccountId: number;
  statementDate: string;
  statementBalance: string;
  openingBalance: string;
  status: 'OPEN' | 'FINALIZED';
  clearedBalance: string | null;
  difference: string | null;
  finalizedAt: string | null;
  summary?: ReconciliationSummary;
}

export const listBankAccounts = (includeInactive = false) => http.get<BankAccount[]>('/banking/accounts', { includeInactive });
export const createBankAccount = (body: { name: string; kind: BankKind; glAccountId?: number; newAccount?: { code: string; name?: string }; accountNumber?: string | null; float?: string | null }) => http.post<BankAccount>('/banking/accounts', body);
export const updateBankAccount = (id: number, body: { name?: string; accountNumber?: string | null; float?: string | null; isActive?: boolean }) => http.put<BankAccount>(`/banking/accounts/${id}`, body);

export const listStatements = (id: number) => http.get<StatementSummary[]>(`/banking/accounts/${id}/statements`);
export const importStatement = (
  id: number,
  body: { label?: string | null; periodStart?: string | null; periodEnd?: string | null; openingBalance?: string | null; closingBalance?: string | null; csv?: string; rows?: Array<{ date: string; description: string; reference?: string | null; amount: string; balance?: string | null }> },
  key: string
) => http.postIdempotent<unknown>(`/banking/accounts/${id}/statements`, body, key);
export const listStatementLines = (id: number, query: { status?: string; from?: string; to?: string }) => http.get<KeysetPage<StatementLine>>(`/banking/accounts/${id}/lines`, query);
export const getUnreconciled = (id: number, asOf?: string) => http.get<Unreconciled>(`/banking/accounts/${id}/unreconciled`, { asOf });
export const autoMatch = (id: number, body: { apply: boolean; windowDays?: number }) => http.post<{ proposals: MatchProposal[]; applied: number }>(`/banking/accounts/${id}/auto-match`, body);
export const lineCandidates = (lineId: number) => http.get<LedgerCandidate[]>(`/banking/lines/${lineId}/candidates`);
export const matchLine = (lineId: number, journalLineIds: number[]) => http.post<unknown>(`/banking/lines/${lineId}/match`, { journalLineIds });
export const unmatchLine = (lineId: number) => http.delete<unknown>(`/banking/lines/${lineId}/match`);
export const ignoreLine = (lineId: number, reason: string) => http.post<unknown>(`/banking/lines/${lineId}/ignore`, { reason });
export const unignoreLine = (lineId: number) => http.post<unknown>(`/banking/lines/${lineId}/unignore`);
export const createEntryFromLine = (lineId: number, body: { accountId: number; fundId: number; memo?: string | null }) => http.post<unknown>(`/banking/lines/${lineId}/create-entry`, body);

export const listReconciliations = (id: number) => http.get<Reconciliation[]>(`/banking/accounts/${id}/reconciliations`);
export const openReconciliation = (id: number, body: { statementDate: string; statementBalance: string; openingBalance?: string }) => http.post<Reconciliation>(`/banking/accounts/${id}/reconciliations`, body);
export const getReconciliation = (id: number) => http.get<Reconciliation>(`/banking/reconciliations/${id}`);
export const finalizeReconciliation = (id: number) => http.post<Reconciliation>(`/banking/reconciliations/${id}/finalize`);
export const deleteReconciliation = (id: number) => http.delete(`/banking/reconciliations/${id}`);
