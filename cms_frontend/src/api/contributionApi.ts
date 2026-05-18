import axiosInstance from './axiosInstance';

export interface Contribution {
  id: number;
  memberId: number;
  amount: number;
  date: string;
  contributionType?: string;
  notes?: string;
  createdAt?: string;
  member?: {
    firstName: string;
    lastName: string;
  };
}

export const fetchContributions = async () => {
  const response = await axiosInstance.get('/contributions');
  return response.data;
};

export const fetchMemberContributions = async (memberId: number) => {
  const response = await axiosInstance.get(`/contributions?memberId=${memberId}`);
  return response.data;
};

export const createContribution = async (data: {
  memberId: number;
  amount: number;
  date: string;
  contributionType?: string;
  notes?: string;
}) => {
  const response = await axiosInstance.post('/contributions', data);
  return response.data;
};

// NEW: Update contribution
export const updateContribution = async (id: number, data: {
  memberId?: number;
  amount?: number;
  date?: string;
  contributionType?: string;
  notes?: string;
}) => {
  const response = await axiosInstance.put(`/contributions/${id}`, data);
  return response.data;
};

export const deleteContribution = async (id: number) => {
  await axiosInstance.delete(`/contributions/${id}`);
};