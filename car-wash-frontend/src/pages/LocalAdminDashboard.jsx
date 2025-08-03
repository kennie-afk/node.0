import React from 'react';
import { Box, Typography, Grid, Paper } from '@mui/material';
import Header from '../components/common/Header';
import RealTimeDashboard from '../components/localAdmin/RealTimeDashboard';
import CarEntryForm from '../components/localAdmin/CarEntryForm';
import EmployeeStatus from '../components/localAdmin/EmployeeStatus';

function LocalAdminDashboard() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: (theme) => theme.palette.background.default }}>
      <Header />
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
        <Typography variant="h4" gutterBottom>
          Local Admin Dashboard
        </Typography>
        <Grid container spacing={4}>
          <Grid item xs={12} md={7}>
            <Paper elevation={2} sx={{ p: { xs: 2, md: 3 } }}>
              <RealTimeDashboard />
            </Paper>
          </Grid>
          <Grid item xs={12} md={5}>
            <Grid container spacing={4}>
              <Grid item xs={12}>
                <Paper elevation={2} sx={{ p: { xs: 2, md: 3 } }}>
                  <CarEntryForm />
                </Paper>
              </Grid>
              <Grid item xs={12}>
                <Paper elevation={2} sx={{ p: { xs: 2, md: 3 } }}>
                  <EmployeeStatus />
                </Paper>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}

export default LocalAdminDashboard;