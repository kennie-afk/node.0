import { CustomJwtPayload } from './auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: CustomJwtPayload;
      id: string;
    }
  }
}

export {};
