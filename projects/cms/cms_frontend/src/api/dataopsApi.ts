import { http } from './http';

export const CONSENT_PURPOSES = ['COMMUNICATIONS', 'DATA_PROCESSING', 'PHOTOS', 'GIVING_RECORDS', 'CHILD_CHECKIN'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];
export type ConsentChannel = 'SMS' | 'EMAIL' | 'ANY';

export interface Consent {
  id: number;
  memberId: number;
  purpose: ConsentPurpose;
  channel: ConsentChannel;
  granted: boolean;
  source: 'STAFF' | 'PAPER' | 'WEB' | 'SELF' | 'IMPORT';
  notes: string | null;
  recordedAt: string;
}

export interface ImportRowError {
  row: number;
  field: string;
  message: string;
}
export interface ImportPreviewRow {
  row: number;
  action: 'CREATE' | 'UPDATE' | 'SKIP';
  name: string;
}
export interface ImportResult {
  id: number | null;
  status: 'DRY_RUN' | 'APPLIED' | 'REJECTED' | string;
  replayed: boolean;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: ImportRowError[];
  preview?: ImportPreviewRow[];
  createdAt?: string;
}
export interface ImportJob extends ImportResult {
  kind: string;
  updateExisting: boolean;
}

export interface ErasureRequest {
  id: number;
  memberId: number;
  requestedBy: number;
  reason: string;
  status: 'PENDING' | 'COMPLETED' | 'REFUSED' | string;
  outcome: 'DELETED' | 'ANONYMISED' | null;
  legalHoldReason: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export const importMembers = (body: { csv: string; dryRun: boolean; updateExisting: boolean; allowPartial: boolean }) => http.post<ImportResult>('/dataops/imports/members', body);
export const listImports = () => http.get<ImportJob[]>('/dataops/imports');
export const getImport = (id: number) => http.get<ImportJob>(`/dataops/imports/${id}`);

export const listConsents = (memberId: number) => http.get<Consent[]>(`/dataops/members/${memberId}/consents`);
export const recordConsent = (memberId: number, body: { purpose: ConsentPurpose; channel: ConsentChannel; granted: boolean; source: Consent['source']; notes?: string | null }) =>
  http.post<Consent[]>(`/dataops/members/${memberId}/consents`, body);
export const dataSubjectExport = (memberId: number) => http.get<Record<string, unknown>>(`/dataops/members/${memberId}/data-export`);

export const listErasures = () => http.get<ErasureRequest[]>('/dataops/erasure-requests');
export const requestErasure = (memberId: number, reason: string) => http.post<ErasureRequest>('/dataops/erasure-requests', { memberId, reason });
export const executeErasure = (id: number) => http.post<ErasureRequest>(`/dataops/erasure-requests/${id}/execute`);
export const refuseErasure = (id: number, reason: string) => http.post<ErasureRequest>(`/dataops/erasure-requests/${id}/refuse`, { reason });
