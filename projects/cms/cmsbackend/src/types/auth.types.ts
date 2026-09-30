import { JwtPayload } from 'jsonwebtoken';
import type { Role } from '../auth/permissions';

export type { Role };

export interface CustomJwtPayload extends JwtPayload {
  id: number;
  email: string;
  churchId: number;
  isAdmin: boolean;
  role?: Role;
}
