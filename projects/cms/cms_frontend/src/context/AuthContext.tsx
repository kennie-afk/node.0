import { createContext, useContext, useState, type ReactNode } from 'react';
import { login as apiLogin } from '../api/authApi';

interface AuthContextType {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(localStorage.getItem('token'));

  const login = async (email: string, password: string) => {
    try {
      const result = await apiLogin(email, password);

      let newToken: string | null = null;

      if (typeof result === 'string') {
        newToken = result;
      } else if (result && typeof result === 'object') {
        newToken = (result as any).token || (result as any).data?.token;
      }

      if (newToken) {
        localStorage.setItem('token', newToken);
        setTokenState(newToken);
      } else {
        throw new Error('No token received from server');
      }
    } catch (err: any) {
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setTokenState(null);
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};