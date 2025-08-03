import axios from 'axios';

const instance = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

instance.interceptors.request.use(
  (config) => {
    let token = localStorage.getItem('authToken');
    
    if (process.env.REACT_APP_USE_DUMMY_AUTH === 'true' && !token) {
        token = process.env.REACT_APP_DUMMY_AUTH_TOKEN;
    }

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default instance;