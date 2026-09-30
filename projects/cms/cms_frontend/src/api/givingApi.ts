import { http, type KeysetPage, type Query } from './http';

export interface MemberRef {
  id: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  phoneNumber?: string | null;
}

export type GiftStatus = 'POSTED' | 'VOID' | 'PENDING';

export interface Gift {
  id: number;
  memberId: number | null;
  member: MemberRef | null;
  contributorName: string | null;
  amount: string;
  amountMinor: number;
  date: string;
  contributionType: string;
  givingTypeId: number | null;
  fundId: number | null;
  fundCode: string | null;
  fundName: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  notes: string | null;
  receiptNo: string | null;
  status: GiftStatus;
  voidReason: string | null;
  journalEntryId: number | null;
  depositAccountId: number | null;
  batchId: number | null;
  pledgeId: number | null;
  campaignId: number | null;
  source: string;
  isAnonymous: boolean;
  taxDeductible: boolean;
  createdAt: string;
}

/** The list endpoint returns both shapes depending on paging mode; the console uses the cursor one. */
export interface GiftFilter {
  memberId?: number | string;
  type?: string;
  fundId?: number | string;
  status?: GiftStatus | '';
  batchId?: number | string;
  pledgeId?: number | string;
  campaignId?: number | string;
  source?: string;
  from?: string;
  to?: string;
  q?: string;
}

export interface GivingType {
  id: number;
  code: string;
  name: string;
  incomeAccountId: number;
  defaultFundId: number | null;
  taxDeductible: boolean;
  isActive: boolean;
}

export interface Batch {
  id: number;
  batchNo: number;
  name: string;
  serviceDate: string;
  status: 'OPEN' | 'COUNTED' | 'POSTED';
  depositAccountId: number | null;
  createdBy: number;
  countedBy: number | null;
  verifiedBy: number | null;
  countedAt: string | null;
  postedAt: string | null;
  journalEntryId: number | null;
  itemCount: number;
  itemsTotal: string;
  itemsTotalMinor: number;
  countedTotal: string | null;
  variance: string | null;
  varianceMinor: number | null;
}

export interface BatchItem {
  id: number;
  memberId: number | null;
  memberName: string | null;
  amount: string;
  contributionType: string;
  paymentMethod: string | null;
  status: GiftStatus;
  receiptNo: string | null;
}

export interface BatchDetail extends Batch {
  items: BatchItem[];
}

export interface Campaign {
  id: number;
  name: string;
  description: string | null;
  goal: string;
  goalMinor: number;
  startDate: string;
  endDate: string | null;
  fundId: number | null;
  status: 'ACTIVE' | 'CLOSED';
  raised: string;
  raisedMinor: number;
  pledged: string;
  pledgedMinor: number;
  pledgeCount: number;
  giftCount: number;
  donorCount: number;
  progressBasisPoints: number;
  remaining: string;
}

export interface Pledge {
  id: number;
  memberId: number;
  memberName: string;
  campaignId: number | null;
  givingTypeId: number | null;
  amount: string;
  amountMinor: number;
  installment: string | null;
  frequency: 'ONE_TIME' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'FULFILLED' | 'CANCELLED';
  notes: string | null;
  fulfilled: string;
  outstanding: string;
  progressBasisPoints: number;
  dueToDate: string;
  behind: string;
  asOf: string;
}

export interface Recurring {
  id: number;
  memberId: number;
  memberName?: string;
  givingTypeId: number;
  fundId: number | null;
  amount: string;
  frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  paymentMethod: string | null;
  startDate: string;
  endDate: string | null;
  nextDueDate: string | null;
  lastGeneratedDate: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
}

export interface Statement {
  year: number;
  currency: string;
  member: { id: number; name: string; email: string | null; phone: string | null; address: string | null };
  gifts: Array<{ id: number; date: string; receiptNo: string | null; type: string; fund: string; method: string | null; amount: string; taxDeductible: boolean }>;
  giftCount: number;
  total: string;
  taxDeductibleTotal: string;
  byType: Array<{ type: string; amount: string }>;
  byFund: Array<{ fund: string; amount: string }>;
  generatedAt: string;
}

export interface MemberPage {
  data: MemberRef[];
  total: number;
}

export const listGifts = (query: GiftFilter & { limit?: number; cursor?: string }) => http.get<KeysetPage<Gift>>('/giving/contributions', query as Query);
export const getGift = (id: number) => http.get<Gift>(`/giving/contributions/${id}`);
export const findReceipt = (receiptNo: string) => http.get<Gift>(`/giving/receipts/${encodeURIComponent(receiptNo)}`);
export const recordGift = (
  body: {
    memberId?: number | null;
    contributorName?: string | null;
    amount: string;
    date: string;
    givingTypeId?: number;
    fundId?: number;
    paymentMethod?: string | null;
    transactionId?: string | null;
    notes?: string | null;
    pledgeId?: number;
    campaignId?: number;
    depositAccountId?: number;
    isAnonymous?: boolean;
  },
  key: string
) => http.postIdempotent<Gift>('/giving/contributions', body, key);
export const voidGift = (id: number, reason: string) => http.post<Gift>(`/giving/contributions/${id}/void`, { reason });

export const listGivingTypes = (includeInactive = false) => http.get<GivingType[]>('/giving/types', { includeInactive });
export const createGivingType = (body: { code: string; name: string; incomeAccountId: number; defaultFundId?: number | null; taxDeductible?: boolean }) => http.post<GivingType>('/giving/types', body);
export const updateGivingType = (id: number, body: Partial<Omit<GivingType, 'id' | 'code'>>) => http.put<GivingType>(`/giving/types/${id}`, body);

export const listBatches = (query: { status?: string }) => http.get<KeysetPage<Batch>>('/giving/batches', query);
export const getBatch = (id: number) => http.get<BatchDetail>(`/giving/batches/${id}`);
export const createBatch = (body: { name: string; serviceDate: string; depositAccountId?: number | null }) => http.post<Batch>('/giving/batches', body);
export const addBatchItem = (id: number, body: { memberId?: number | null; contributorName?: string | null; amount: string; givingTypeId?: number; fundId?: number; paymentMethod?: string | null }) =>
  http.post<BatchItem>(`/giving/batches/${id}/items`, body);
export const removeBatchItem = (id: number, contributionId: number) => http.delete(`/giving/batches/${id}/items/${contributionId}`);
export const countBatch = (id: number, countedTotal: string) => http.post<BatchDetail>(`/giving/batches/${id}/count`, { countedTotal });
export const reopenBatch = (id: number) => http.post<BatchDetail>(`/giving/batches/${id}/reopen`);
export const verifyBatch = (id: number) => http.post<BatchDetail>(`/giving/batches/${id}/verify`);

export const listCampaigns = (status?: string) => http.get<Campaign[]>('/giving/campaigns', { status });
export const getCampaign = (id: number) => http.get<Campaign>(`/giving/campaigns/${id}`);
export const createCampaign = (body: { name: string; description?: string | null; goal?: string; startDate: string; endDate?: string | null; fundId?: number | null }) => http.post<Campaign>('/giving/campaigns', body);
export const updateCampaign = (id: number, body: { name?: string; description?: string | null; goal?: string; endDate?: string | null; status?: 'ACTIVE' | 'CLOSED'; fundId?: number | null }) => http.put<Campaign>(`/giving/campaigns/${id}`, body);

export const listPledges = (query: { memberId?: number | string; campaignId?: number | string; status?: string; behindOnly?: boolean }) =>
  http.get<KeysetPage<Pledge>>('/giving/pledges', { ...query, behindOnly: query.behindOnly ? 'true' : undefined });
export const getPledge = (id: number) => http.get<Pledge>(`/giving/pledges/${id}`);
export const createPledge = (body: { memberId: number; campaignId?: number | null; givingTypeId?: number | null; amount: string; installment?: string; frequency: string; startDate: string; endDate?: string | null; notes?: string | null }) =>
  http.post<Pledge>('/giving/pledges', body);
export const updatePledge = (id: number, body: { amount?: string; installment?: string | null; endDate?: string | null; notes?: string | null }) => http.put<Pledge>(`/giving/pledges/${id}`, body);
export const cancelPledge = (id: number, reason: string) => http.post<Pledge>(`/giving/pledges/${id}/cancel`, { reason });

export const listRecurring = (query: { memberId?: number | string; status?: string }) => http.get<Recurring[]>('/giving/recurring', query);
export const createRecurring = (body: { memberId: number; givingTypeId: number; fundId?: number | null; amount: string; frequency: string; paymentMethod?: string | null; startDate: string; endDate?: string | null }) => http.post<Recurring>('/giving/recurring', body);
export const updateRecurring = (id: number, body: { amount?: string; status?: string; endDate?: string | null; paymentMethod?: string | null }) => http.put<Recurring>(`/giving/recurring/${id}`, body);
export const runRecurring = (asOf?: string) => http.post<unknown>('/giving/recurring/run', { asOf });

export const getStatement = (memberId: number, year: number) => http.get<Statement>(`/giving/statements/members/${memberId}`, { year });

/**
 * There is no member search endpoint yet (GET /members has offset paging only), so the pickers
 * fetch one page of members and narrow it in the browser. Replace with a server-side `q` once the
 * backend has one.
 */
export async function searchMembers(text: string): Promise<MemberRef[]> {
  const page = await http.get<MemberPage>('/members', { page: 1, pageSize: 100 });
  const needle = text.trim().toLowerCase();
  const rows = needle
    ? page.data.filter((m) => `${m.firstName} ${m.lastName} ${m.phoneNumber ?? ''} ${m.email ?? ''}`.toLowerCase().includes(needle))
    : page.data;
  return rows.slice(0, 20);
}
export const getMember = (id: number) => http.get<MemberRef>(`/members/${id}`);
