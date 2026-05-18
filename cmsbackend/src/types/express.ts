import { Request } from 'express';
import { User } from '@users/user.model';
import { JwtPayload } from 'jsonwebtoken';

export interface CustomJwtPayload extends JwtPayload {
  id: number;
  email: string;
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: User | CustomJwtPayload;
}
