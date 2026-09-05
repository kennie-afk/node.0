import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProduction } from '../config/env';
import { logger } from '../common/logger';
import { AppError, UnauthorizedError } from '../domain/errors';

export interface Principal {
  userId: string;
  orgId: string;
  siteId: string | null;
  role: 'owner' | 'manager' | 'supervisor' | 'worker' | 'support';
}

declare global {
  namespace Express {
    interface Request {
      id: string;
      principal?: Principal;
    }
  }
}

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info('request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e5) / 10,
      orgId: req.principal?.orgId
    });
  });

  next();
};

export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('A bearer token is required.'));
  }

  try {
    const claims = jwt.verify(header.slice(7).trim(), env.JWT_SECRET) as Record<string, unknown>;
    if (typeof claims.orgId !== 'string' || typeof claims.sub !== 'string') {
      return next(new UnauthorizedError('Token does not identify an organisation.'));
    }

    req.principal = {
      userId: claims.sub,
      orgId: claims.orgId,
      siteId: typeof claims.siteId === 'string' ? claims.siteId : null,
      role: claims.role as Principal['role']
    };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token.'));
  }
};

export const requireRole =
  (...allowed: Principal['role'][]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.principal || !allowed.includes(req.principal.role)) {
      return next(new AppError(403, 'forbidden', 'Your role does not allow this.'));
    }
    next();
  };

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({ code: 'not-found', message: `No route matches ${req.method} ${req.originalUrl}` });
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof AppError) {
    logger.warn('request rejected', { requestId: req.id, code: error.code, status: error.statusCode });
    return res
      .status(error.statusCode)
      .json({ code: error.code, message: error.message, requestId: req.id });
  }

  logger.error('unhandled error', {
    requestId: req.id,
    path: req.originalUrl,
    error: error instanceof Error ? error.message : String(error),
    stack: isProduction ? undefined : error instanceof Error ? error.stack : undefined
  });

  res.status(500).json({ code: 'internal', message: 'Internal Server Error', requestId: req.id });
};
