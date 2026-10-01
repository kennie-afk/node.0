import axiosInstance from './axiosInstance';

export interface User {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  role?: string;
  createdAt: string;
}

export const createUser = async (userData: {
  username: string;
  email: string;
  password: string;
  role?: string;
}) => {
  const response = await axiosInstance.post('/users', userData);
  return response.data;
};


export const updateUser = async (id: number, userData: Partial<{
  username: string;
  email: string;
  password?: string;
  role?: string;
}>) => {
  const response = await axiosInstance.put(`/users/${id}`, userData);
  return response.data;
};

export const deleteUser = async (id: number) => {
  await axiosInstance.delete(`/users/${id}`);
};



