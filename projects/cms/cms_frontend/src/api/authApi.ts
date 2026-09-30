import axiosInstance from './axiosInstance';

export interface LoginResponse {
  token: string;
  expiresInSeconds: number;
  churchId: number;
  role?: string;
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const response = await axiosInstance.post<LoginResponse>('/auth/login', { email, password });
  return response.data;
};

export const getProfile = async () => {
  const response = await axiosInstance.get('/auth/profile');
  return response.data;
};
