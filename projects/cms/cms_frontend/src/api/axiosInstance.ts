import axios from 'axios';
import { clearSession, readSession } from './session';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
  const session = readSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const isLoginAttempt = error?.config?.url?.includes('/auth/login');

    if (status === 401 && !isLoginAttempt) {
      clearSession();
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
