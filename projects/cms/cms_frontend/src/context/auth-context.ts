import { createContext, useContext } from 'react';
import type { Permission, Role } from '../auth/permissions';

export interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  role: Role;
  /** The church's own name for the signed-in role, as the server sent it. */
  roleLabel: string;
  email: string | null;
  userId: number | null;
  churchId: number | null;
  permissions: readonly string[];
  /** True when the signed-in role holds the permission (the server still enforces it). */
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};
