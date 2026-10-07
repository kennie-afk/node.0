import { unwrapList } from './pagination';
import axiosInstance from './axiosInstance';

export interface Member {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  familyId?: number;
  family?: { familyName: string };
  middleName?: string | null;
  city?: string | null;
  county?: string | null;
  postalCode?: string | null;
  status?: string;
  baptismDate?: string | null;
  membershipDate?: string;
  notes?: string | null;
  createdAt: string;
}

export const MEMBER_STATUSES = ['Active', 'Inactive', 'New Convert', 'Deceased', 'Guest'] as const;

/** The one-request pastoral view. giving and care are null when the viewer's role cannot read them. */
export interface MemberProfile {
  member: Member & { address?: string | null };
  familyMembers: Array<{ id: number; firstName: string; lastName: string; status: string }>;
  ministries: Array<{ id: number; name: string; role: string | null }>;
  smallGroups: Array<{ id: number; name: string }>;
  attendance: { last90Days: number; recent: Array<{ id: number; date: string; type: string; eventName: string | null; sermonTitle: string | null }> };
  giving: { giftCount: number; totalMinor: number; lastGiftAt: string | null; recent: Array<{ id: number; date: string; amount: string; contributionType: string; receiptNo: string | null }> } | null;
  care: { notes: Array<{ id: number; kind: string; occurredOn: string; body: string | null; redacted: boolean; isConfidential: boolean }> } | null;
}

export const fetchMembers = async () => {
  const response = await axiosInstance.get('/members');
  return unwrapList<Member>(response.data);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMember = async (memberData: any) => {
  const response = await axiosInstance.post('/members', memberData);
  return response.data;
};

export const deleteMember = async (id: number) => {
  await axiosInstance.delete(`/members/${id}`);
};