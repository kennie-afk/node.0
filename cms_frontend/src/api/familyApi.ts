import axiosInstance from './axiosInstance';

export interface Family {
  id: number;
  familyName: string;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export const fetchFamilies = async () => {
  const response = await axiosInstance.get('/families');
  return response.data;
};

export const createFamily = async (familyData: Omit<Family, 'id' | 'createdAt' | 'updatedAt'>) => {
  const response = await axiosInstance.post('/families', familyData);
  return response.data;
};

export const updateFamily = async (id: number, familyData: Partial<Omit<Family, 'id' | 'createdAt' | 'updatedAt'>>) => {
  const response = await axiosInstance.put(`/families/${id}`, familyData);
  return response.data;
};

export const deleteFamily = async (id: number) => {
  await axiosInstance.delete(`/families/${id}`);
};