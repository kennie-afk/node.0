import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, responsiveFontSizes } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import AuthContext from './context/AuthContext';
import Login from './components/auth/Login';
import LocalAdminDashboard from './pages/LocalAdminDashboard';
import MainAdminDashboard from './pages/MainAdminDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';

let theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1a76d2',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#f4f6f8',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
    h4: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 500,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

theme = responsiveFontSizes(theme);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const role = localStorage.getItem('userRole');
    if (token && role) {
      setIsAuthenticated(true);
      setUserRole(role);
    }
  }, []);

  const authContextValue = {
    isAuthenticated,
    userRole,
    login: (token, role) => {
      localStorage.setItem('authToken', token);
      localStorage.setItem('userRole', role);
      setIsAuthenticated(true);
      setUserRole(role);
    },
    logout: () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userRole');
      setIsAuthenticated(false);
      setUserRole(null);
    },
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/local-admin" element={
              isAuthenticated && userRole === 'local_admin' ? (
                <LocalAdminDashboard />
              ) : (
                <Navigate to="/login" replace />
              )
            } />
            <Route path="/main-admin" element={
              isAuthenticated && userRole === 'main_admin' ? (
                <MainAdminDashboard />
              ) : (
                <Navigate to="/login" replace />
              )
            } />
            <Route path="/employee-dashboard" element={
              isAuthenticated && userRole === 'employee' ? (
                <EmployeeDashboard />
              ) : (
                <Navigate to="/login" replace />
              )
            } />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<h1>404 Not Found</h1>} />
          </Routes>
        </Router>
      </ThemeProvider>
    </AuthContext.Provider>
  );
}

export default App;