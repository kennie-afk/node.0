import React, { useContext } from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';

function Header() {
  const { userRole, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AppBar position="static" color="primary" elevation={4}>
      <Toolbar sx={{ px: { xs: 2, sm: 4 } }}>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1, color: 'white' }}>
          Car Wash System
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ mr: 2, color: 'white', display: { xs: 'none', sm: 'block' } }}>
            Logged in as: {userRole}
          </Typography>
          <Button color="inherit" onClick={handleLogout} sx={{ color: 'white' }}>
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;