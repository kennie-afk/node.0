import React, { useState, useEffect } from 'react';
import { Box, Typography, List, ListItem, ListItemText, Chip, Divider, Paper, CircularProgress } from '@mui/material';
import { getEmployeeStatus } from '../../api/localAdminApi';
import { CheckCircleOutline, CircleOutlined, PeopleAlt } from '@mui/icons-material';

function EmployeeStatus() {
  const [employeeStatus, setEmployeeStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEmployeeStatus = async () => {
    try {
      const response = await getEmployeeStatus();
      setEmployeeStatus(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch employee status.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeeStatus();
    const interval = setInterval(fetchEmployeeStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const engagedEmployees = employeeStatus.filter(emp => emp.currentTask);
  const availableEmployees = employeeStatus.filter(emp => !emp.currentTask);

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" sx={{ height: 100 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={2}>
        <PeopleAlt sx={{ mr: 1, color: 'text.secondary' }} />
        <Typography variant="h6" gutterBottom>
          Employee Status
        </Typography>
      </Box>
      {error && <Typography color="error">{error}</Typography>}
      <Box mb={2}>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
          Engaged Employees ({engagedEmployees.length})
        </Typography>
        <Paper elevation={1} sx={{ p: 1 }}>
          <List dense>
            {engagedEmployees.length > 0 ? (
              engagedEmployees.map((emp) => (
                <div key={emp.id}>
                  <ListItem disablePadding>
                    <ListItemText
                      primary={emp.name}
                      secondary={`Working on: ${emp.currentTask.plateNumber} (${emp.currentTask.serviceType})`}
                      sx={{ mr: 1 }}
                    />
                    <Chip label="Busy" color="warning" size="small" icon={<CircleOutlined />} />
                  </ListItem>
                  <Divider component="li" sx={{ my: 0.5 }} />
                </div>
              ))
            ) : (
              <ListItem><ListItemText secondary="No employees are currently engaged." /></ListItem>
            )}
          </List>
        </Paper>
      </Box>
      <Box>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
          Available Employees ({availableEmployees.length})
        </Typography>
        <Paper elevation={1} sx={{ p: 1 }}>
          <List dense>
            {availableEmployees.length > 0 ? (
              availableEmployees.map((emp) => (
                <div key={emp.id}>
                  <ListItem disablePadding>
                    <ListItemText primary={emp.name} />
                    <Chip label="Available" color="success" size="small" icon={<CheckCircleOutline />} />
                  </ListItem>
                  <Divider component="li" sx={{ my: 0.5 }} />
                </div>
              ))
            ) : (
              <ListItem><ListItemText secondary="All employees are currently engaged." /></ListItem>
            )}
          </List>
        </Paper>
      </Box>
    </Box>
  );
}

export default EmployeeStatus;