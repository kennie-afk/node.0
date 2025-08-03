import axios from './axiosConfig';

export const getActiveCars = () => axios.get('/api/local-admin/cars/active');
export const addCarEntry = (carData) => axios.post('/api/local-admin/cars/entry', carData);
export const getEmployees = () => axios.get('/api/employees');
export const getEmployeeStatus = () => axios.get('/api/local-admin/employees/status');
export const startService = (serviceId) => axios.post(`/api/services/${serviceId}/start`);
export const endService = (serviceId) => axios.post(`/api/services/${serviceId}/end`);
export const confirmPayment = (plateNumber) => axios.post(`/api/local-admin/payment/confirm`, { plateNumber });