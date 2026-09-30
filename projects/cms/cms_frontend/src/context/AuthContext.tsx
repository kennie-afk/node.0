import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as apiLogin } from '../api/authApi';
import { clearSession, onSessionChange, readSession, writeSession } from '../api/session';
import { decodeClaims } from '../auth/jwt';
import { can as roleCan, permissionsOf } from '../auth/permissions';
import { AuthContext, type AuthContextType } from './auth-context';

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

  const value = useMemo<AuthContextType>(() => {
    const claims = decodeClaims(token);
    return {
      token,
      isAuthenticated: !!token,
      role: claims.role,
      email: claims.email,
      userId: claims.id,
      churchId: claims.churchId,
      permissions: permissionsOf(claims.role),
      can: (permission) => roleCan(claims.role, permission),
      login: async (email: string, password: string) => {
        const session = await apiLogin(email, password);
        writeSession(session.token, session.expiresInSeconds, session.churchId);
      },
      logout: () => clearSession()
    };
  }, [token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
