import { http, type KeysetPage } from './http';

export type NoteKind = 'PASTORAL' | 'COUNSELING' | 'HOSPITAL' | 'BEREAVEMENT' | 'OTHER';
export type VisitationKind = 'HOME' | 'HOSPITAL' | 'PRISON' | 'OTHER';
export type PrayerStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

export interface CareNote {
  id: number;
  memberId: number;
  authorUserId: number;
  kind: NoteKind;
  /** null when the note is confidential and the viewer is neither its author nor an administrator. */
  body: string | null;
  isConfidential: boolean;
  occurredOn: string;
  followUpOn: string | null;
  followUpDone: boolean;
  redacted: boolean;
  createdAt: string;
}
export interface PrayerRequest {
  id: number;
  memberId: number | null;
  requesterName: string | null;
  body: string;
  isPrivate: boolean;
  status: PrayerStatus;
  answeredNote: string | null;
  createdAt: string;
}
export interface Visitation {
  id: number;
  memberId: number;
  visitorUserId: number;
  visitDate: string;
  kind: VisitationKind;
  summary: string;
  followUpOn: string | null;
  followUpDone: boolean;
}
export interface FollowUps {
  notes: Array<{ id: number; memberId: number; member: string; kind: NoteKind; followUpOn: string; confidential: boolean }>;
  visitations: Array<{ id: number; memberId: number; member: string; kind: VisitationKind; followUpOn: string }>;
}

export const listNotes = (q: { memberId: number; limit?: number; cursor?: string }) => http.get<KeysetPage<CareNote>>('/care/notes', q);
export const getNote = (id: number) => http.get<CareNote>(`/care/notes/${id}`);
export const createNote = (body: { memberId: number; kind?: NoteKind; body: string; isConfidential?: boolean; occurredOn?: string; followUpOn?: string | null }) => http.post<CareNote>('/care/notes', body);
export const updateNote = (id: number, body: Partial<{ body: string; kind: NoteKind; isConfidential: boolean; followUpOn: string | null; followUpDone: boolean }>) => http.put<CareNote>(`/care/notes/${id}`, body);
export const deleteNote = (id: number) => http.delete(`/care/notes/${id}`);

export const listPrayerRequests = (q: { status?: PrayerStatus; limit?: number; cursor?: string }) => http.get<KeysetPage<PrayerRequest>>('/care/prayer-requests', q);
export const createPrayerRequest = (body: { memberId?: number | null; requesterName?: string | null; body: string; isPrivate?: boolean }) => http.post<PrayerRequest>('/care/prayer-requests', body);
export const updatePrayerRequest = (id: number, body: { status?: PrayerStatus; answeredNote?: string | null }) => http.put<PrayerRequest>(`/care/prayer-requests/${id}`, body);

export const listVisitations = (q: { memberId: number; limit?: number; cursor?: string }) => http.get<KeysetPage<Visitation>>('/care/visitations', q);
export const logVisitation = (body: { memberId: number; visitDate?: string; kind?: VisitationKind; summary: string; followUpOn?: string | null }) => http.post<Visitation>('/care/visitations', body);
export const completeVisitationFollowUp = (id: number) => http.post<Visitation>(`/care/visitations/${id}/follow-up-done`);
export const followUps = (within: number) => http.get<FollowUps>('/care/followups', { within });
