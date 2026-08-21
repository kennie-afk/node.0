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
  return response.data;
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