import React, { useState } from 'react';
import { Box, TextField, Button, Typography, MenuItem, Select, FormControl, InputLabel, Alert } from '@mui/material';
import { DirectionsCarFilled } from '@mui/icons-material';
import { addCarEntry } from '../../api/localAdminApi';

function CarEntryForm() {
  const [plateNumber, setPlateNumber] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const services = ['Washing Inside', 'Washing Outside', 'Both'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const carData = { plateNumber, serviceType };
      const response = await addCarEntry(carData);
      setSuccess(`Car ${response.data.plateNumber} entered and assigned to employee successfully!`);
      setPlateNumber('');
      setServiceType('');
    } catch (err) {
      setError('Failed to add car entry. Please check car details.');
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Box display="flex" alignItems="center" mb={2}>
        <DirectionsCarFilled sx={{ mr: 1, color: 'text.secondary' }} />
        <Typography variant="h6" gutterBottom>
          New Car Entry
        </Typography>
      </Box>
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField
        label="Plate Number"
        variant="outlined"
        fullWidth
        margin="normal"
        value={plateNumber}
        onChange={(e) => setPlateNumber(e.target.value)}
        required
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Service Type</InputLabel>
        <Select
          value={serviceType}
          label="Service Type"
          onChange={(e) => setServiceType(e.target.value)}
          required
        >
          {services.map((service) => (
            <MenuItem key={service} value={service}>
              {service}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Button
        type="submit"
        variant="contained"
        color="primary"
        fullWidth
        sx={{ mt: 3 }}
      >
        Submit Car Entry
      </Button>
    </Box>
  );
}

export default CarEntryForm;