import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, Card, CardContent, Paper, CircularProgress, Divider, List, ListItem, ListItemText, Chip, ListItemIcon } from '@mui/material';
import { getActiveCars } from '../../api/localAdminApi';
import { ReportProblem, Verified, AccessTimeFilled, PlayCircleFilled, CheckCircle, DirectionsCarFilled, PeopleAlt } from '@mui/icons-material';

const getStatusColor = (status) => {
    switch (status) {
        case 'Pending': return 'warning';
        case 'In-Progress': return 'info';
        case 'Completed': return 'success';
        default: return 'default';
    }
};

const getStatusIcon = (status) => {
    switch (status) {
        case 'Pending': return <AccessTimeFilled sx={{ color: 'warning.main', fontSize: 24 }} />;
        case 'In-Progress': return <PlayCircleFilled sx={{ color: 'info.main', fontSize: 24 }} />;
        case 'Completed': return <CheckCircle sx={{ color: 'success.main', fontSize: 24 }} />;
        default: return null;
    }
};

function RealTimeDashboard() {
  const [data, setData] = useState({
    activeCars: [],
    availableEmployees: [],
    issueCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const response = await getActiveCars();
      setData(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch real-time data.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" sx={{ height: 300 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Real-Time Operations Dashboard
      </Typography>
      {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}

      <Grid container spacing={3}>
        {/* Active Car Count */}
        <Grid item xs={12} md={4}>
          <Card elevation={2}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <ReportProblem color="warning" sx={{ mr: 1, fontSize: 32 }} />
                <Typography variant="h6">
                  Issues Reported
                </Typography>
              </Box>
              <Typography variant="h4" component="div" sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                {data.issueCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Available Employees */}
        <Grid item xs={12} md={4}>
          <Card elevation={2}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <Verified color="success" sx={{ mr: 1, fontSize: 32 }} />
                <Typography variant="h6">
                  Employees Available
                </Typography>
              </Box>
              <Typography variant="h4" component="div" sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                {data.availableEmployees.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Active Cars */}
        <Grid item xs={12} md={4}>
          <Card elevation={2}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <PlayCircleFilled color="info" sx={{ mr: 1, fontSize: 32 }} />
                <Typography variant="h6">
                  Active Cars
                </Typography>
              </Box>
              <Typography variant="h4" component="div" sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                {data.activeCars.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      <Grid container spacing={3} sx={{ mt: 2 }}>
        {/* Active Cars List */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" mb={1}>
                <DirectionsCarFilled sx={{ mr: 1, color: 'text.secondary' }} />
                <Typography variant="h6" gutterBottom>
                    Active Cars
                </Typography>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <List>
              {data.activeCars.length > 0 ? (
                data.activeCars.map(car => (
                  <ListItem key={car.id} divider>
                    <ListItemIcon>
                        {getStatusIcon(car.status)}
                    </ListItemIcon>
                    <ListItemText
                      primary={<Typography variant="body1" sx={{ fontWeight: 'bold' }}>{car.plateNumber}</Typography>}
                      secondary={`Service: ${car.serviceType} | Employee: ${car.assignedEmployee}`}
                    />
                    <Chip label={car.status} color={getStatusColor(car.status)} size="small" />
                  </ListItem>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">No cars are currently active.</Typography>
              )}
            </List>
          </Paper>
        </Grid>

        {/* Available Employees List */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" mb={1}>
                <PeopleAlt sx={{ mr: 1, color: 'text.secondary' }} />
                <Typography variant="h6" gutterBottom>
                    Available Employees
                </Typography>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <List>
              {data.availableEmployees.length > 0 ? (
                data.availableEmployees.map(employee => (
                  <ListItem key={employee.id} divider>
                    <ListItemText primary={employee.name} secondary={`ID: ${employee.id}`} />
                    <Chip label="Available" color="success" size="small" />
                  </ListItem>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">All employees are currently busy.</Typography>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default RealTimeDashboard;