import { http, type KeysetPage } from './http';

export interface Room {
  id: number;
  name: string;
  minAgeMonths: number;
  maxAgeMonths: number;
  capacity: number;
  isActive: boolean;
  present?: number;
}
export interface Guardian {
  id: number;
  childId: number;
  memberId: number | null;
  name: string;
  phone: string | null;
  relationship: string | null;
  isAuthorizedPickup: boolean;
}
export interface Child {
  id: number;
  memberId: number | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  allergies: string | null;
  medicalNotes: string | null;
  photoConsent: boolean;
  isActive: boolean;
  ageMonths?: number;
  guardians?: Guardian[];
}
export interface Session {
  id: number;
  eventId: number | null;
  roomId: number;
  childId: number;
  securityTag: string;
  status: 'IN' | 'OUT';
  checkedInAt: string;
  checkedOutAt: string | null;
  overrideReason: string | null;
  /** Shown once, in the response to check-in; it is stored only as a hash. */
  pickupCode?: string;
  flagged?: boolean;
  firstName?: string;
  lastName?: string;
  allergies?: string | null;
  medicalNotes?: string | null;
  roomName?: string;
  child?: { id: number; firstName: string; lastName: string; allergies: string | null; medicalNotes: string | null };
}
export type SecurityEventType = 'CHECK_IN' | 'CHECK_OUT' | 'DENIED' | 'FLAGGED' | 'OVERRIDE';
export interface SecurityEvent {
  id: number;
  sessionId: number | null;
  childId: number | null;
  type: SecurityEventType;
  actorUserId: number | null;
  detail: string | null;
  createdAt: string;
}

export interface GuardianInput {
  name: string;
  phone?: string | null;
  relationship?: string;
  memberId?: number | null;
  isAuthorizedPickup?: boolean;
}

export const listRooms = () => http.get<Room[]>('/checkin/rooms');
export const createRoom = (body: { name: string; minAgeMonths: number; maxAgeMonths: number; capacity: number }) => http.post<Room>('/checkin/rooms', body);
export const updateRoom = (id: number, body: Partial<{ name: string; capacity: number; isActive: boolean; minAgeMonths: number; maxAgeMonths: number }>) => http.put<Room>(`/checkin/rooms/${id}`, body);

export const listChildren = (q: { q?: string; limit?: number; cursor?: string }) => http.get<KeysetPage<Child>>('/checkin/children', q);
export const getChild = (id: number) => http.get<Child>(`/checkin/children/${id}`);
export const createChild = (body: { memberId?: number | null; firstName: string; lastName: string; dateOfBirth: string; allergies?: string | null; medicalNotes?: string | null; photoConsent?: boolean; guardians?: GuardianInput[] }) =>
  http.post<Child>('/checkin/children', body);
export const updateChild = (id: number, body: Partial<{ firstName: string; lastName: string; allergies: string | null; medicalNotes: string | null; photoConsent: boolean; isActive: boolean }>) =>
  http.put<Child>(`/checkin/children/${id}`, body);
export const addGuardian = (childId: number, body: GuardianInput) => http.post<Guardian>(`/checkin/children/${childId}/guardians`, body);
export const updateGuardian = (id: number, body: Partial<Omit<GuardianInput, 'memberId'>>) => http.put<Guardian>(`/checkin/guardians/${id}`, body);
export const removeGuardian = (id: number) => http.delete(`/checkin/guardians/${id}`);

export const checkIn = (body: { childId: number; roomId: number; eventId?: number | null; guardianId?: number | null }) => http.post<Session>('/checkin/sessions', body);
export const checkOut = (id: number, body: { code: string; guardianId: number; overrideReason?: string | null }) => http.post<Session>(`/checkin/sessions/${id}/checkout`, body);
export const listSessions = (q: { status?: 'IN' | 'OUT'; roomId?: number; childId?: number; from?: string; to?: string; limit?: number; cursor?: string }) => http.get<KeysetPage<Session>>('/checkin/sessions', q);
export const listSecurityEvents = (q: { childId?: number; type?: SecurityEventType; limit?: number; cursor?: string }) => http.get<KeysetPage<SecurityEvent>>('/checkin/events', q);
