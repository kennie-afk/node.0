import React from 'react';
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { BarChart, People, AdminPanelSettings } from '@mui/icons-material';

function SideNav({ activeView, onViewChange }) {
  return (
    <Box
      sx={{
        width: 240,
        flexShrink: 0,
        height: '100%',
        backgroundColor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <List component="nav" disablePadding>
        <ListItemButton
          selected={activeView === 'sales'}
          onClick={() => onViewChange('sales')}
          sx={{ borderRadius: 2 }}
        >
          <ListItemIcon>
            <BarChart />
          </ListItemIcon>
          <ListItemText primary="Sales Reports" />
        </ListItemButton>
        <ListItemButton
          selected={activeView === 'admins'}
          onClick={() => onViewChange('admins')}
          sx={{ borderRadius: 2 }}
        >
          <ListItemIcon>
            <AdminPanelSettings />
          </ListItemIcon>
          <ListItemText primary="Admin Management" />
        </ListItemButton>
        <ListItemButton
          selected={activeView === 'employees'}
          onClick={() => onViewChange('employees')}
          sx={{ borderRadius: 2 }}
        >
          <ListItemIcon>
            <People />
          </ListItemIcon>
          <ListItemText primary="Employee Management" />
        </ListItemButton>
      </List>
    </Box>
  );
}

export default SideNav;