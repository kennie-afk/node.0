import axios from './axiosConfig';

export const loginUser = (username, password, role) => {
  if (process.env.REACT_APP_USE_DUMMY_AUTH === 'true') {
    return new Promise((resolve, reject) => {
      if (role === 'local_admin' && username === 'local' && password === 'localpass') {
        resolve({ token: process.env.REACT_APP_DUMMY_AUTH_TOKEN, role: 'local_admin' });
      } else if (role === 'main_admin' && username === 'main' && password === 'mainpass') {
        resolve({ token: process.env.REACT_APP_DUMMY_AUTH_TOKEN, role: 'main_admin' });
      } else if (role === 'employee' && username === 'emp' && password === 'emppass') {
        resolve({ token: process.env.REACT_APP_DUMMY_AUTH_TOKEN, role: 'employee' });
      } else {
        reject(new Error('Invalid credentials or role mismatch'));
      }
    });
  }

  return axios.post('/api/auth/login', { username, password })
    .then(response => {
      if (response.data && response.data.token && response.data.role) {
        return response.data;
      }
      throw new Error('Invalid login response');
    });
};