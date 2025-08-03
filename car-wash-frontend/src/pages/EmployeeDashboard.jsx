import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import Header from '../components/common/Header';
import EmployeeTasks from '../components/employee/EmployeeTasks';

function EmployeeDashboard() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: (theme) => theme.palette.background.default }}>
      <Header />
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
        <Typography variant="h4" gutterBottom>
          Employee Dashboard
        </Typography>
        <Paper elevation={2} sx={{ p: { xs: 2, md: 3 } }}>
          <EmployeeTasks />
        </Paper>
      </Box>
    </Box>
  );
}

export default EmployeeDashboard;