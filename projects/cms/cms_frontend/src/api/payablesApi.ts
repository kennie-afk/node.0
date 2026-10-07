import { http, type KeysetPage, type Query } from './http';

export type VendorKind = 'VENDOR' | 'STAFF' | 'MEMBER';
export type BillStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';

export interface Vendor {
  id: number;
  kind: VendorKind;
  name: string;
  kraPin: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAccount: string | null;
  mpesaNumber: string | null;
  memberId: number | null;
  notes: string | null;
  isActive: boolean;
}

export interface BillSummary {
  id: number;
  billNo: number;
  kind: 'VENDOR_BILL' | 'EXPENSE_CLAIM';
  vendorId: number;
  vendorName: string;
  reference: string | null;
  billDate: string;
  dueDate: string;
  memo: string | null;
  status: BillStatus;
  total: string;
  totalMinor: number;
  paid: string;
  paidMinor: number;
  outstanding: string;
  createdBy: number;
  submittedBy: number | null;
  requiredApprovals: number;
  journalEntryId: number | null;
  warnings: string[];
  rejectedReason: string | null;
  voidReason: string | null;
}

export interface BillLine {
  lineNo: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  fundId: number;
  fundCode: string;
  ministryId: number | null;
  description: string | null;
  amount: string;
}

export interface BillPayment {
  id: number;
  billId: number;
  paidDate: string;
  amount: string;
  amountMinor: number;
  fromAccountId: number;
  reference: string | null;
  status: 'POSTED' | 'VOID';
  journalEntryId: number | null;
  voidReason: string | null;
}

export interface PayResult {
  replayed: boolean;
  payment: BillPayment;
  bill: Bill;
}

export interface PettyStatus {
  bankAccount: { id: number; name: string };
  float: string | null;
  balance: string;
  unreplenished: string;
  unreplenishedVouchers: number;
  shortfallToFloat: string | null;
}

export interface Bill extends BillSummary {
  lines: BillLine[];
  approvals: Array<{ approverId: number; approvedAt: string; auto: boolean }>;
  payments: BillPayment[];
  attachments: BillAttachment[];
}

export interface BillAttachment {
  id: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string | null;
  createdAt?: string;
}

export interface BillLineInput {
  accountId: number;
  fundId: number;
  ministryId?: number | null;
  description?: string | null;
  amount: string;
}

export interface BillInput {
  vendorId: number;
  reference?: string | null;
  billDate: string;
  dueDate: string;
  memo?: string | null;
  lines: BillLineInput[];
}

export interface AgingBucketRow {
  vendorId: number;
  vendor: string;
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
  bills: Array<{ billId: number; billNo: number; dueDate: string; daysOverdue: number; owed: string; bucket: string }>;
}

export interface Aging {
  asOf: string;
  vendors: AgingBucketRow[];
  totals: { current: string; days1to30: string; days31to60: string; days61to90: string; over90: string; total: string };
}

export interface Voucher {
  id: number;
  voucherNo: number;
  pettyAccountId: number;
  date: string;
  payee: string;
  memo: string | null;
  accountId: number;
  fundId: number;
  ministryId: number | null;
  amount: string;
  amountMinor: number;
  status: 'POSTED' | 'VOID';
  journalEntryId: number | null;
  replenished: boolean;
  voidReason: string | null;
}

export const listVendors = (query: { q?: string; kind?: string; active?: boolean }) => http.get<KeysetPage<Vendor>>('/payables/vendors', query as Query);
export const getVendor = (id: number) => http.get<Vendor>(`/payables/vendors/${id}`);
export const createVendor = (body: Partial<Vendor> & { name: string }) => http.post<Vendor>('/payables/vendors', body);
export const updateVendor = (id: number, body: Partial<Vendor>) => http.put<Vendor>(`/payables/vendors/${id}`, body);

export const listBills = (query: { status?: string; vendorId?: number | string; kind?: string; from?: string; to?: string; q?: string; overdue?: boolean }) =>
  http.get<KeysetPage<BillSummary>>('/payables/bills', { ...query, overdue: query.overdue ? 'true' : undefined });
export const getBill = (id: number) => http.get<Bill>(`/payables/bills/${id}`);
export const createBill = (body: BillInput & { kind?: 'VENDOR_BILL' | 'EXPENSE_CLAIM' }) => http.post<Bill>('/payables/bills', body);
export const createExpenseClaim = (body: BillInput) => http.post<Bill>('/payables/expense-claims', body);
export const updateBill = (id: number, body: Partial<BillInput>) => http.put<Bill>(`/payables/bills/${id}`, body);
export const deleteBill = (id: number) => http.delete(`/payables/bills/${id}`);
export const submitBill = (id: number) => http.post<Bill>(`/payables/bills/${id}/submit`);
export const approveBill = (id: number, postingDate?: string) => http.post<Bill>(`/payables/bills/${id}/approve`, postingDate ? { postingDate } : {});
export const rejectBill = (id: number, reason: string) => http.post<Bill>(`/payables/bills/${id}/reject`, { reason });
export const voidBill = (id: number, reason: string) => http.post<Bill>(`/payables/bills/${id}/void`, { reason });
export const payBill = (id: number, body: { amount: string; paidDate?: string; bankAccountId?: number; reference?: string | null }, key: string) =>
  http.postIdempotent<PayResult>(`/payables/bills/${id}/pay`, body, key);
export const voidPayment = (billId: number, paymentId: number, reason: string) => http.post<Bill>(`/payables/bills/${billId}/payments/${paymentId}/void`, { reason });

/** The file is the raw body (its own Content-Type), the name rides in the query: no multipart, no base64. */
export const uploadAttachment = (billId: number, file: File) =>
  http.post<Bill>(`/payables/bills/${billId}/attachments?fileName=${encodeURIComponent(file.name)}`, file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } });
export const attachmentLink = (billId: number, attachmentId: number) =>
  http.get<{ url: string; expiresAt: string; fileName: string }>(`/payables/bills/${billId}/attachments/${attachmentId}/link`);
export const removeAttachment = (billId: number, attachmentId: number) => http.delete<Bill>(`/payables/bills/${billId}/attachments/${attachmentId}`);

export const getAging = (asOf?: string) => http.get<Aging>('/payables/reports/aging', { asOf });

export const listVouchers = (query: { bankAccountId?: number | string; status?: string }) => http.get<KeysetPage<Voucher>>('/payables/petty-cash/vouchers', query);
export const createVoucher = (body: { bankAccountId: number; date: string; payee: string; memo?: string | null; accountId: number; fundId: number; ministryId?: number | null; amount: string }) =>
  http.post<Voucher>('/payables/petty-cash/vouchers', body);
export const voidVoucher = (id: number, reason: string) => http.post<Voucher>(`/payables/petty-cash/vouchers/${id}/void`, { reason });
export const pettyStatus = (bankAccountId: number) => http.get<PettyStatus>(`/payables/petty-cash/${bankAccountId}/status`);
export const replenishPetty = (bankAccountId: number, body: { date?: string; sourceBankAccountId?: number }) => http.post<Record<string, unknown>>(`/payables/petty-cash/${bankAccountId}/replenish`, body);
