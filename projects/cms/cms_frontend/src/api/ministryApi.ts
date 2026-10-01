import { unwrapList } from './pagination';
import axiosInstance from './axiosInstance';

export interface Ministry {
  id: number;
  name: string;
  description?: string | null;
  leaderId?: number | null;
  isActive?: boolean;
  leader?: {
    id?: number;
    firstName: string;
    lastName: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface MinistryMember {
  id: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  phoneNumber?: string | null;
  role?: string | null;
}

interface MinistryMembershipRow {
  memberId: number;
  role?: string | null;
  member?: {
    id: number;
    firstName: string;
    lastName: string;
    email?: string | null;
    phoneNumber?: string | null;
  } | null;
}

export const fetchMinistryMembers = async (ministryId: number) => {
  const response = await axiosInstance.get(`/ministries/${ministryId}/members`);
  return unwrapList<MinistryMembershipRow>(response.data).map((row) => ({
    id: row.memberId,
    firstName: row.member?.firstName ?? 'Unknown',
    lastName: row.member?.lastName ?? '',
    email: row.member?.email ?? null,
    phoneNumber: row.member?.phoneNumber ?? null,
    role: row.role ?? null
  }));
};

export const addMinistryMember = async (ministryId: number, memberId: number, role?: string) => {
  const response = await axiosInstance.post(`/ministries/${ministryId}/members`, {
    memberId,
    ...(role ? { role } : {})
  });
  return response.data;
};

export const removeMinistryMember = async (ministryId: number, memberId: number) => {
  await axiosInstance.delete(`/ministries/${ministryId}/members`, { data: { memberId } });
};
