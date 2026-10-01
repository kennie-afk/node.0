import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as apiLogin } from '../api/authApi';
import { clearSession, onSessionChange, readSession, writeSession } from '../api/session';
import { decodeClaims } from '../auth/jwt';
import { can as hasPermission, roleLabelFallback } from '../auth/permissions';
import { getProfile } from '../api/authApi';
import { AuthContext, type AuthContextType } from './auth-context';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(() => readSession()?.token ?? null);
  const [permissions, setPermissions] = useState<readonly string[]>(() => readSession()?.permissions ?? []);
  const [roleLabel, setRoleLabel] = useState<string | null>(() => readSession()?.roleLabel ?? null);

  useEffect(
    () =>
      onSessionChange(() => {
        const session = readSession();
        setTokenState(session?.token ?? null);
        setPermissions(session?.permissions ?? []);
        setRoleLabel(session?.roleLabel ?? null);
      }),
    []
  );

  // A session stored before permissions were sent with sign-in has a token but no grants: ask the
  // server once instead of making the person sign in again.
  useEffect(() => {
    const session = readSession();
    if (!session || session.permissions.length > 0) return;
    getProfile()
      .then((profile: { permissions?: string[]; roleLabel?: string }) => {
        const granted = profile.permissions ?? [];
        if (granted.length > 0) writeSession(session.token, Math.max(1, Math.round((session.expiresAt - Date.now()) / 1000)), session.churchId, granted, profile.roleLabel);
      })
      .catch(() => undefined);
  }, [token]);

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
      roleLabel: roleLabel ?? roleLabelFallback(claims.role),
      email: claims.email,
      userId: claims.id,
      churchId: claims.churchId,
      permissions,
      can: (permission) => hasPermission(permissions, permission),
      login: async (email: string, password: string) => {
        const session = await apiLogin(email, password);
        writeSession(session.token, session.expiresInSeconds, session.churchId, session.permissions ?? [], session.roleLabel);
      },
      logout: () => clearSession()
    };
  }, [token, permissions, roleLabel]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
