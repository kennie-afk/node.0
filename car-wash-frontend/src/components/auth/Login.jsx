import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, Button, Typography, Paper, Alert, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import AuthContext from '../../context/AuthContext';
import { loginUser } from '../../api/authApi';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [error, setError] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!selectedRole) {
      setError('Please select a role.');
      return;
    }
    try {
      const response = await loginUser(username, password, selectedRole);
      login(response.token, response.role);
      if (response.role === 'local_admin') {
        navigate('/local-admin');
      } else if (response.role === 'main_admin') {
        navigate('/main-admin');
      } else if (response.role === 'employee') {
        navigate('/employee-dashboard');
      }
    } catch (err) {
      setError('Login failed. Please check your credentials and role.');
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: (theme) => theme.palette.background.default,
      }}
    >
      <Paper elevation={6} sx={{ p: { xs: 3, md: 6 }, minWidth: { xs: 300, sm: 400 }, textAlign: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom color="primary">
          Smart Car Wash 
        </Typography>
        <Typography variant="h6" gutterBottom>
          Login
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleLogin} sx={{ mt: 2 }}>
          <FormControl fullWidth margin="normal">
            <InputLabel id="role-select-label">Login As</InputLabel>
            <Select
              labelId="role-select-label"
              id="role-select"
              value={selectedRole}
              label="Login As"
              onChange={(e) => setSelectedRole(e.target.value)}
              required
            >
              <MenuItem value="main_admin">Main Admin</MenuItem>
              <MenuItem value="local_admin">Local Admin</MenuItem>
              <MenuItem value="employee">Employee</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Username"
            variant="outlined"
            fullWidth
            margin="normal"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            variant="outlined"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mt: 3, mb: 2, py: 1.5 }}
          >
            Sign In
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default Login;