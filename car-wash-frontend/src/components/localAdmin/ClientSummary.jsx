import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, Card, CardContent, CircularProgress } from '@mui/material';
import { DirectionsCarFilled, AccessTimeFilled, PlayCircleFilled, CheckCircleFilled } from '@mui/icons-material';
import { getActiveCars } from '../../api/localAdminApi';

function ClientSummary() {
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    ongoing: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCarSummary = async () => {
    try {
      const response = await getActiveCars();
      const cars = response.data;
      setSummary({
        total: cars.length,
        pending: cars.filter(car => car.status === 'PENDING').length,
        ongoing: cars.filter(car => car.status === 'IN_PROGRESS').length,
        completed: cars.filter(car => car.status === 'COMPLETED').length,
      });
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch car summary.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCarSummary();
    const interval = setInterval(fetchCarSummary, 5000);
    return () => clearInterval(interval);
  }, []);

  const cards = [
    { title: "Total Cars", value: summary.total, icon: <DirectionsCarFilled sx={{ color: 'primary.main', fontSize: 35 }} /> },
    { title: "Pending", value: summary.pending, icon: <AccessTimeFilled sx={{ color: 'info.main', fontSize: 35 }} /> },
    { title: "Ongoing", value: summary.ongoing, icon: <PlayCircleFilled sx={{ color: 'warning.main', fontSize: 35 }} /> },
    { title: "Completed", value: summary.completed, icon: <CheckCircleFilled sx={{ color: 'success.main', fontSize: 35 }} /> },
  ];

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" sx={{ height: 100 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ mb: 4 }}>
      {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
      <Grid container spacing={3}>
        {cards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card elevation={2}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
                <Box sx={{ mr: 2 }}>
                  {card.icon}
                </Box>
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    {card.title}
                  </Typography>
                  <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
                    {card.value}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default ClientSummary;