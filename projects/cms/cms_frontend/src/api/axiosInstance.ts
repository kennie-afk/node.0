import axios from 'axios';
import { clearSession, readSession } from './session';

// With no VITE_API_URL the console talks to the same origin under /api, which nginx (or the
// ingress) forwards to the API, so one image works in every environment.
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || '/api';

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
