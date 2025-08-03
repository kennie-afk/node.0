import axios from './axiosConfig';

export const getSalesReport = () => axios.get('/api/main-admin/reports/sales');
export const getEmployeeList = () => axios.get('/api/main-admin/employees');
export const addEmployee = (employeeData) => axios.post('/api/main-admin/employees', employeeData);
export const getAdminList = () => axios.get('/api/main-admin/admins');
export const registerAdmin = (adminData) => axios.post('/api/main-admin/admins/register', adminData);