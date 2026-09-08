import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { login as apiLogin } from '../api/authApi';
import { clearSession, onSessionChange, readSession, writeSession } from '../api/session';

interface AuthContextType {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(() => readSession()?.token ?? null);

  useEffect(() => onSessionChange(() => setTokenState(readSession()?.token ?? null)), []);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      return;
    }

    const timer = window.setTimeout(clearSession, session.expiresAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [token]);

  const login = async (email: string, password: string) => {
    const session = await apiLogin(email, password);
    writeSession(session.token, session.expiresInSeconds, session.churchId);
  };

  const logout = () => {
    clearSession();
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
