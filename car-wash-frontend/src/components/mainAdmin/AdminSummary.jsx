import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, Card, CardContent, CircularProgress } from '@mui/material';
import { PeopleAlt, BarChart, DirectionsCarFilled, AttachMoney } from '@mui/icons-material';
import { getAdminList, getEmployeeList, getSalesReport } from '../../api/mainAdminApi';

function AdminSummary() {
  const [summary, setSummary] = useState({
    totalAdmins: 0,
    totalEmployees: 0,
    totalCarsWashed: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSummaryData = async () => {
    try {
      const [adminsResponse, employeesResponse, salesResponse] = await Promise.all([
        getAdminList(),
        getEmployeeList(),
        getSalesReport(),
      ]);

      const totalCarsWashed = salesResponse.data.reduce((sum, day) => sum + day.carsWashed, 0);
      const totalRevenue = salesResponse.data.reduce((sum, day) => sum + day.totalSales, 0);

      setSummary({
        totalAdmins: adminsResponse.data.length,
        totalEmployees: employeesResponse.data.length,
        totalCarsWashed: totalCarsWashed,
        totalRevenue: totalRevenue,
      });
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch summary data.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaryData();
    const interval = setInterval(fetchSummaryData, 10000);
    return () => clearInterval(interval);
  }, []);

  const cards = [
    { title: "Total Admins", value: summary.totalAdmins, icon: <PeopleAlt sx={{ color: 'primary.main', fontSize: 35 }} /> },
    { title: "Total Employees", value: summary.totalEmployees, icon: <PeopleAlt sx={{ color: 'info.main', fontSize: 35 }} /> },
    { title: "Total Cars Washed", value: summary.totalCarsWashed, icon: <DirectionsCarFilled sx={{ color: 'warning.main', fontSize: 35 }} /> },
    { title: "Total Revenue", value: summary.totalRevenue, icon: <AttachMoney sx={{ color: 'success.main', fontSize: 35 }} /> },
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

export default AdminSummary;