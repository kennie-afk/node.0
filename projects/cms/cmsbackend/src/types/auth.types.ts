import { JwtPayload } from 'jsonwebtoken';

export type Role = 'MEMBER' | 'STAFF' | 'ADMIN';

export interface CustomJwtPayload extends JwtPayload {
  id: number;
  email: string;
  churchId: number;
  isAdmin: boolean;
}
