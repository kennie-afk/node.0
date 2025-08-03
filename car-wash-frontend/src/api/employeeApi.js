import axios from './axiosConfig';

export const getEmployeeTasks = () => axios.get('/api/employee/tasks');
export const startTask = (taskId) => axios.post(`/api/employee/tasks/${taskId}/start`);
export const endTask = (taskId) => axios.post(`/api/employee/tasks/${taskId}/end`);
export const requestPayment = (taskId) => axios.post(`/api/employee/tasks/${taskId}/payment`);