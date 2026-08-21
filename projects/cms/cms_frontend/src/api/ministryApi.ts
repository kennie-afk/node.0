import axiosInstance from './axiosInstance';

export interface Ministry {
  id: number;
  name: string;
  description?: string;
  leaderId?: number | null;
  leader?: {
    firstName: string;
    lastName: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export const fetchMinistries = async () => {
  const response = await axiosInstance.get('/ministries');
  return response.data;
};

export const createMinistry = async (ministryData: Omit<Ministry, 'id' | 'createdAt' | 'updatedAt'>) => {
  const response = await axiosInstance.post('/ministries', ministryData);
  return response.data;
};

export const updateMinistry = async (id: number, ministryData: Partial<Ministry>) => {
  const response = await axiosInstance.put(`/ministries/${id}`, ministryData);
  return response.data;
};

export const deleteMinistry = async (id: number) => {
  await axiosInstance.delete(`/ministries/${id}`);
};