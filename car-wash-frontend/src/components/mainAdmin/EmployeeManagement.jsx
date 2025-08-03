import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Alert, Select, MenuItem, FormControl, InputLabel, Grid, CircularProgress } from '@mui/material';
import { People } from '@mui/icons-material';
import { getEmployeeList, addEmployee } from '../../api/mainAdminApi';

function EmployeeManagement() {
  const [employees, setEmployees] = useState([]);
  const [newEmployee, setNewEmployee] = useState({ name: '', username: '', password: '', role: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchEmployees = async () => {
    try {
      const response = await getEmployeeList();
      setEmployees(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch employee list.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewEmployee({ ...newEmployee, [name]: value });
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const response = await addEmployee(newEmployee);
      setEmployees([...employees, response.data]);
      setSuccess(`Employee ${response.data.name} added successfully.`);
      setNewEmployee({ name: '', username: '', password: '', role: '' });
    } catch (err) {
      setError('Failed to add employee. Please check the details and try again.');
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" sx={{ height: 300 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={2}>
        <People sx={{ mr: 1, color: 'text.secondary' }} />
        <Typography variant="h6" gutterBottom>
          Employee Management
        </Typography>
      </Box>
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Box component="form" onSubmit={handleAddEmployee} sx={{ mb: 4, p: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
          Add New Employee
        </Typography>
        <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
                <TextField
                label="Name"
                name="name"
                variant="outlined"
                fullWidth
                size="small"
                value={newEmployee.name}
                onChange={handleInputChange}
                required
                />
            </Grid>
            <Grid item xs={12} sm={6}>
                <TextField
                label="Username"
                name="username"
                variant="outlined"
                fullWidth
                size="small"
                value={newEmployee.username}
                onChange={handleInputChange}
                required
                />
            </Grid>
            <Grid item xs={12} sm={6}>
                <TextField
                label="Password"
                name="password"
                type="password"
                variant="outlined"
                fullWidth
                size="small"
                value={newEmployee.password}
                onChange={handleInputChange}
                required
                />
            </Grid>
            <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select
                    label="Role"
                    name="role"
                    value={newEmployee.role}
                    onChange={handleInputChange}
                    required
                >
                    <MenuItem value="wash_bay_employee">Wash Bay Employee</MenuItem>
                </Select>
                </FormControl>
            </Grid>
            <Grid item xs={12}>
                <Button type="submit" variant="contained">
                Add Employee
                </Button>
            </Grid>
        </Grid>
      </Box>

      <Typography variant="h6" gutterBottom>
        View All Employees
      </Typography>
      <TableContainer component={Paper} elevation={1}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Username</TableCell>
              <TableCell>Role</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>{employee.name}</TableCell>
                <TableCell>{employee.username}</TableCell>
                <TableCell>{employee.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default EmployeeManagement;