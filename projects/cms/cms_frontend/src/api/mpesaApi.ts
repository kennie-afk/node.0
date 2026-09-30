import { http, type KeysetPage } from './http';

export interface MpesaConfig {
  mode: 'mock' | 'daraja';
  configured: boolean;
  callbackBaseUrl: string | null;
  c2bValidationUrl: string | null;
  c2bConfirmationUrl: string | null;
  stkCallbackUrl: string | null;
}

export interface MpesaReceipt {
  id: number;
  transId: string;
  channel: string;
  amount: string;
  amountMinor: number;
  msisdn: string | null;
  billRef: string | null;
  payerName: string | null;
  transTime: string;
  status: 'MATCHED' | 'UNALLOCATED' | 'ALLOCATED' | 'ERROR';
  memberId: number | null;
  contributionId: number | null;
  fundId: number | null;
  error: string | null;
}

export interface StkRequest {
  id: number;
  memberId: number | null;
  phone: string;
  amountMinor: number;
  status: string;
  checkoutRequestId: string | null;
  mpesaReceipt: string | null;
  resultDesc: string | null;
  createdAt: string;
}

export const getMpesaConfig = () => http.get<MpesaConfig>('/mpesa/config');
export const listMpesaReceipts = (query: { status?: string }) => http.get<KeysetPage<MpesaReceipt>>('/mpesa/transactions', query);
export const allocateReceipt = (id: number, body: { memberId?: number | null; givingTypeId: number; fundId?: number | null; contributorName?: string | null }) => http.post<unknown>(`/mpesa/transactions/${id}/allocate`, body);
export const retryReceipt = (id: number) => http.post<unknown>(`/mpesa/transactions/${id}/retry`);
export const stkPush = (body: { memberId?: number; phone?: string; amount: string; givingTypeId?: number; fundId?: number }) =>
  http.post<{ id: number; status: string; provider: string; checkoutRequestId?: string; message?: string }>('/mpesa/stk-push', body);
export const listStkRequests = () => http.get<StkRequest[]>('/mpesa/stk-requests');
export const simulateC2b = (body: { amount: string; msisdn?: string; billRef?: string; payerName?: string }) => http.post<unknown>('/mpesa/simulate/c2b', body);
export const simulateStkResult = (body: { checkoutRequestId: string; success: boolean }) => http.post<unknown>('/mpesa/simulate/stk-result', body);
