import React, { useState, useEffect } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Alert, Chip, CircularProgress } from '@mui/material';
import { BarChart as BarChartIcon, ReportProblem, Verified } from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getSalesReport } from '../../api/mainAdminApi';

function SalesDashboard() {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSalesData = async () => {
      try {
        const response = await getSalesReport();
        setSalesData(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch sales report.');
        setLoading(false);
      }
    };
    fetchSalesData();
  }, []);

  const getFraudIcon = (fraudCount) => {
    if (fraudCount > 0) {
      return <Chip icon={<ReportProblem />} label={`${fraudCount} Fraud`} color="error" size="small" />;
    }
    return <Chip icon={<Verified />} label="OK" color="success" size="small" />;
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" sx={{ height: 300 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={2}>
        <BarChartIcon sx={{ mr: 1, color: 'text.secondary' }} />
        <Typography variant="h6" gutterBottom>
          Sales Report
        </Typography>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ height: 300, width: '100%', mb: 4 }}>
        <ResponsiveContainer>
          <BarChart data={salesData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="totalSales" fill="#42a5f5" name="Total Sales ($)" />
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <TableContainer component={Paper} elevation={0}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell align="right">Total Sales ($)</TableCell>
              <TableCell align="right">Cars Washed</TableCell>
              <TableCell align="center">Fraud Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {salesData.map((row) => (
              <TableRow key={row.date}>
                <TableCell component="th" scope="row">
                  {row.date}
                </TableCell>
                <TableCell align="right">{row.totalSales}</TableCell>
                <TableCell align="right">{row.carsWashed}</TableCell>
                <TableCell align="center">{getFraudIcon(row.fraudIncidents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default SalesDashboard;