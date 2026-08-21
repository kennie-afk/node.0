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
  createdAt: string;
}

export const fetchMembers = async () => {
  const response = await axiosInstance.get('/members');
  return response.data;
};

export const createMember = async (memberData: any) => {
  const response = await axiosInstance.post('/members', memberData);
  return response.data;
};

export const deleteMember = async (id: number) => {
  await axiosInstance.delete(`/members/${id}`);
};