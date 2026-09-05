import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { CustomJwtPayload } from '../types/auth.types';
import { runWithTenant } from '../common/tenant-context';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = bearer(req);

  if (!token) {
    return next(new UnauthorizedError('Authentication token required.'));
  }

  let claims: CustomJwtPayload;
  try {
    claims = jwt.verify(token, env.JWT_SECRET) as CustomJwtPayload;
  } catch {
    return next(new UnauthorizedError('Invalid or expired token.'));
  }

  if (typeof claims.churchId !== 'number' || typeof claims.id !== 'number') {
    return next(new UnauthorizedError('Token does not identify a church.'));
  }

  req.user = claims;

  runWithTenant(
    {
      churchId: claims.churchId,
      userId: claims.id,
      isAdmin: Boolean(claims.isAdmin),
      requestId: req.id
    },
    () => next()
  );
};

export const authorizeAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user?.isAdmin) {
    return next(new ForbiddenError('Admin access required.'));
  }
  next();
};
