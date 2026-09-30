import { http, type KeysetPage } from './http';
import type { Consent } from './dataopsApi';

export interface MeProfile {
  user: { id: number; username: string; email: string; role: string };
  permissions: string[];
  /** null when an administrator has not linked this sign-in to a member record. */
  member: null | {
    id: number;
    firstName: string;
    middleName: string | null;
    lastName: string;
    gender: string | null;
    dateOfBirth: string | null;
    email: string | null;
    phoneNumber: string | null;
    address: string | null;
    city: string | null;
    county: string | null;
    postalCode: string | null;
    status: string;
    baptismDate: string | null;
    membershipDate: string | null;
    familyId: number | null;
  };
}
export interface MyGroups {
  ministries: Array<Record<string, unknown> & { id: number; name: string; role?: string | null }>;
  smallGroups: Array<Record<string, unknown> & { id: number; name: string; role?: string | null }>;
}
export interface MyEvents {
  upcoming: Array<{ id: number; name: string; type: string; startTime: string; endTime: string | null; location: string | null }>;
  serving: Array<{ id: number; status: 'PENDING' | 'CONFIRMED' | 'DECLINED'; startsAt: string; eventName: string; teamName: string }>;
}
export interface MyFamily {
  family: null | { id: number; familyName: string; address?: string | null };
  members: Array<{ id: number; firstName: string; lastName: string; gender?: string | null; dateOfBirth?: string | null }>;
}
export interface MyGift {
  id: number;
  amount: string;
  date: string;
  contributionType: string;
  receiptNo?: string | null;
  status?: string;
  paymentMethod?: string | null;
}
export interface MyGiving extends KeysetPage<MyGift> {
  totalForYear: string;
  year: number | null;
}

export const me = () => http.get<MeProfile>('/me');
export const updateProfile = (body: Partial<{ phoneNumber: string | null; email: string | null; address: string | null; city: string | null; county: string | null; postalCode: string | null }>) =>
  http.put<MeProfile>('/me/profile', body);
export const myGroups = () => http.get<MyGroups>('/me/groups');
export const myEvents = () => http.get<MyEvents>('/me/events');
export const myFamily = () => http.get<MyFamily>('/me/family');
export const myGiving = (q: { year?: number; limit?: number; cursor?: string }) => http.get<MyGiving>('/me/giving', q);
export const submitPrayer = (body: { body: string; isPrivate: boolean }) => http.post('/me/prayer-requests', body);
export const myConsents = () => http.get<Consent[]>('/me/consents');
export const setMyConsent = (body: { purpose: string; channel: 'SMS' | 'EMAIL' | 'ANY'; granted: boolean }) => http.post<Consent[]>('/me/consents', body);

export interface AccountLink {
  userId: number;
  username: string;
  email: string;
  memberId: number | null;
  firstName: string | null;
  lastName: string | null;
}
export const listAccountLinks = () => http.get<AccountLink[]>('/account-links');
export const linkAccount = (userId: number, memberId: number) => http.post<{ userId: number; memberId: number }>('/account-links', { userId, memberId });
export const unlinkAccount = (userId: number) => http.delete(`/account-links/${userId}`);
