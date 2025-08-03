import React, { useState } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import Header from '../components/common/Header';
import SideNav from '../components/mainAdmin/SideNav';
import AdminSummary from '../components/mainAdmin/AdminSummary';
import SalesDashboard from '../components/mainAdmin/SalesDashboard';
import AdminManagement from '../components/mainAdmin/AdminManagement';
import EmployeeManagement from '../components/mainAdmin/EmployeeManagement';

function MainAdminDashboard() {
  const [activeView, setActiveView] = useState('sales');

  const renderContent = () => {
    switch (activeView) {
      case 'sales':
        return <SalesDashboard />;
      case 'admins':
        return <AdminManagement />;
      case 'employees':
        return <EmployeeManagement />;
      default:
        return <SalesDashboard />;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: (theme) => theme.palette.background.default }}>
      <Header />
      <Box sx={{ display: 'flex', flexGrow: 1 }}>
        <SideNav activeView={activeView} onViewChange={setActiveView} />
        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
          <Typography variant="h4" gutterBottom>
            Main Admin Dashboard
          </Typography>
          <AdminSummary />
          <Paper elevation={2} sx={{ p: { xs: 2, md: 3 } }}>
            {renderContent()}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}

export default MainAdminDashboard;