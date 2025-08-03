import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, Card, CardContent, Button, Alert, Chip } from '@mui/material';
import { getEmployeeTasks, startTask, endTask, requestPayment } from '../../api/employeeApi';
import { ReportProblem, Verified } from '@mui/icons-material';

function EmployeeTasks() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchTasks = async () => {
    try {
      const response = await getEmployeeTasks();
      setTasks(response.data);
    } catch (err) {
      setError('Failed to fetch tasks.');
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleStartTask = async (taskId) => {
    try {
      await startTask(taskId);
      setSuccess('Task started successfully.');
      fetchTasks();
    } catch (err) {
      setError('Failed to start task.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING':
        return 'info';
      case 'IN_PROGRESS':
        return 'warning';
      case 'COMPLETED':
        return 'success';
      default:
        return 'default';
    }
  };

  const pendingTasks = tasks.filter(task => task.status === 'PENDING');
  const ongoingTasks = tasks.filter(task => task.status === 'IN_PROGRESS');

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        My Assigned Tasks
      </Typography>
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Pending</Typography>
      <Grid container spacing={2}>
        {pendingTasks.length > 0 ? (
          pendingTasks.map((task) => (
            <Grid item xs={12} sm={6} md={4} key={task.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="h5" component="div">
                      {task.plateNumber}
                    </Typography>
                    {task.isFraudulent ? (
                      <Chip icon={<ReportProblem />} label="Fraud" color="error" size="small" />
                    ) : (
                      <Chip icon={<Verified />} label="OK" color="success" size="small" />
                    )}
                  </Box>
                  <Typography color="text.secondary">
                    Service: {task.serviceType}
                  </Typography>
                  <Typography color="text.secondary">
                    Time Assigned: {new Date(task.assignedTime).toLocaleTimeString()}
                  </Typography>
                  <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={task.status !== 'PENDING'}
                      onClick={() => handleStartTask(task.id)}
                    >
                      Start Service
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))
        ) : (
          <Grid item xs={12}>
            <Typography>No new tasks assigned.</Typography>
          </Grid>
        )}
      </Grid>
      
      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Ongoing</Typography>
      <Grid container spacing={2}>
        {ongoingTasks.length > 0 ? (
          ongoingTasks.map((task) => (
            <Grid item xs={12} sm={6} md={4} key={task.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="h5" component="div">
                      {task.plateNumber}
                    </Typography>
                    {task.isFraudulent ? (
                      <Chip icon={<ReportProblem />} label="Fraud" color="error" size="small" />
                    ) : (
                      <Chip icon={<Verified />} label="OK" color="success" size="small" />
                    )}
                  </Box>
                  <Typography color="text.secondary">
                    Service: {task.serviceType}
                  </Typography>
                  <Typography color="text.secondary">
                    Time Started: {new Date(task.startTime).toLocaleTimeString()}
                  </Typography>
                  <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    <Chip label="In Progress" color="warning" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))
        ) : (
          <Grid item xs={12}>
            <Typography>No tasks are currently in progress.</Typography>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

export default EmployeeTasks;