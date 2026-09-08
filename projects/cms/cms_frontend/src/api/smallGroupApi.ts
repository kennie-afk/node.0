import { unwrapList } from './pagination';
import axiosInstance from './axiosInstance';

export interface SmallGroup {
  id: number;
  name: string;
  description?: string | null;
  ministryId: number;
  leaderId?: number | null;
  meetingDay?: string | null;
  meetingTime?: string | null;
  meetingLocation?: string | null;
  isActive?: boolean;
  notes?: string | null;
  parentMinistry?: {
    id: number;
    name: string;
  };
  ministry?: {
    id: number;
    name: string;
  };
  leader?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export const fetchSmallGroups = async () => {
  const response = await axiosInstance.get('/small-groups');
  return unwrapList<SmallGroup>(response.data);
};

export const createSmallGroup = async (data: Omit<SmallGroup, 'id' | 'createdAt' | 'updatedAt'>) => {
  const response = await axiosInstance.post('/small-groups', data);
  return response.data;
};

export const updateSmallGroup = async (id: number, data: Partial<SmallGroup>) => {
  const response = await axiosInstance.put(`/small-groups/${id}`, data);
  return response.data;
};

export const deleteSmallGroup = async (id: number) => {
  await axiosInstance.delete(`/small-groups/${id}`);
};

export interface SmallGroupMember {
  id: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  phoneNumber?: string | null;
  role?: string | null;
}

interface SmallGroupMembershipRow {
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

export const fetchSmallGroupMembers = async (smallGroupId: number) => {
  const response = await axiosInstance.get(`/small-groups/${smallGroupId}/members`);
  return unwrapList<SmallGroupMembershipRow>(response.data).map((row) => ({
    id: row.memberId,
    firstName: row.member?.firstName ?? 'Unknown',
    lastName: row.member?.lastName ?? '',
    email: row.member?.email ?? null,
    phoneNumber: row.member?.phoneNumber ?? null,
    role: row.role ?? null
  }));
};

export const addSmallGroupMember = async (
  smallGroupId: number,
  memberId: number,
  role?: string
) => {
  const response = await axiosInstance.post(
    `/small-groups/${smallGroupId}/members/${memberId}`,
    role ? { role } : {}
  );
  return response.data;
};

export const removeSmallGroupMember = async (smallGroupId: number, memberId: number) => {
  await axiosInstance.delete(`/small-groups/${smallGroupId}/members/${memberId}`);
};
