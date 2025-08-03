import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Alert, Select, MenuItem, FormControl, InputLabel, Grid, CircularProgress } from '@mui/material';
import { AdminPanelSettings } from '@mui/icons-material';
import { getAdminList, registerAdmin } from '../../api/mainAdminApi';

function AdminManagement() {
  const [admins, setAdmins] = useState([]);
  const [newAdmin, setNewAdmin] = useState({
    username: '',
    email: '',
    role: '',
    password: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchAdmins = async () => {
    try {
      const response = await getAdminList();
      setAdmins(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch admin list.');
      setLoading(false);
    }
  };

  useEffect(() => {
      fetchAdmins();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewAdmin({ ...newAdmin, [name]: value });
  };

  const handleRegisterAdmin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const response = await registerAdmin(newAdmin);
      setAdmins([...admins, response.data]);
      setSuccess(`Admin ${response.data.username} registered successfully.`);
      setNewAdmin({ username: '', email: '', role: '', password: '' });
    } catch (err) {
      setError('Failed to register admin.');
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" sx={{ height: 300 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={2}>
        <AdminPanelSettings sx={{ mr: 1, color: 'text.secondary' }} />
        <Typography variant="h6" gutterBottom>
          Admin Management
        </Typography>
      </Box>
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Box component="form" onSubmit={handleRegisterAdmin} sx={{ mb: 4, p: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
          Register New Admin
        </Typography>
        <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
                <TextField
                label="Username"
                name="username"
                variant="outlined"
                fullWidth
                size="small"
                value={newAdmin.username}
                onChange={handleInputChange}
                required
                />
            </Grid>
            <Grid item xs={12} sm={6}>
                <TextField
                label="Email"
                name="email"
                type="email"
                variant="outlined"
                fullWidth
                size="small"
                value={newAdmin.email}
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
                    value={newAdmin.role}
                    onChange={handleInputChange}
                    required
                >
                    <MenuItem value="main_admin">Main Admin</MenuItem>
                    <MenuItem value="local_admin">Local Admin</MenuItem>
                </Select>
                </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
                <TextField
                label="Password"
                name="password"
                type="password"
                variant="outlined"
                fullWidth
                size="small"
                value={newAdmin.password}
                onChange={handleInputChange}
                required
                />
            </Grid>
            <Grid item xs={12}>
                <Button type="submit" variant="contained">
                Register Admin
                </Button>
            </Grid>
        </Grid>
      </Box>

      <Typography variant="h6" gutterBottom>
        View All Admins
      </Typography>
      <TableContainer component={Paper} elevation={1}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Username</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {admins.map((admin) => (
              <TableRow key={admin.id}>
                <TableCell>{admin.username}</TableCell>
                <TableCell>{admin.email}</TableCell>
                <TableCell>{admin.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default AdminManagement;