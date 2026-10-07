import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { accounts, tokenIsCurrent } from './accounts';
import { env, isProduction } from '../config/env';
import { logger } from '../common/logger';
import { AppError, UnauthorizedError } from '../domain/errors';
import { currentStatus } from '../billing/service';
import { writesAllowed } from '../billing/state';

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
      path: redactPath(req.originalUrl),
      status: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e5) / 10,
      orgId: req.principal?.orgId
    });
  });

  next();
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('A bearer token is required.'));
  }

  let claims: Record<string, unknown>;
  try {
    claims = jwt.verify(header.slice(7).trim(), env.JWT_SECRET) as Record<string, unknown>;
  } catch {
    return next(new UnauthorizedError('Invalid or expired token.'));
  }
  if (typeof claims.orgId !== 'string' || typeof claims.sub !== 'string') {
    return next(new UnauthorizedError('Token does not identify an organisation.'));
  }

  try {
    // The token proves who signed in; the account row decides whether they still may, and as what.
    const account = await accounts.get(claims.orgId, claims.sub);
    if (!tokenIsCurrent(account, claims.tv)) {
      return next(new UnauthorizedError('This session has ended. Sign in again.'));
    }
    req.principal = { userId: claims.sub, orgId: claims.orgId, siteId: account.siteId, role: account.role };
    next();
  } catch (error) {
    next(error);
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

/**
 * A suspended (long-unpaid) organisation keeps every record and every read; it cannot change its
 * configuration or run reconciliation actions until it pays. Capture paths - telemetry, M-Pesa
 * confirmations, a worker's job events - are NOT gated, so no data is ever lost while an account is
 * behind. Paying reactivates immediately.
 */
export const requireWritable = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const status = await currentStatus(req.principal!.orgId);
    if (!writesAllowed(status)) {
      return next(
        new AppError(402, 'subscription-suspended', 'This account is read-only until the Forecourt subscription is paid. Your data is safe; open Billing to pay.')
      );
    }
    next();
  } catch (error) {
    next(error);
  }
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

  // Constraint violations are the caller's doing (a duplicate till number, a row still in use).
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === '23505' || pg.code === '23503') {
    const message = pg.code === '23505' ? 'That value is already in use.' : 'That record is still referred to by other records.';
    logger.warn('request rejected', { requestId: req.id, code: pg.code, constraint: pg.constraint });
    return res.status(409).json({ code: 'conflict', message, requestId: req.id });
  }
  if (pg.code === '22P02') {
    return res.status(400).json({ code: 'bad-request', message: 'A value had the wrong format.', requestId: req.id });
  }

  logger.error('unhandled error', {
    requestId: req.id,
    path: redactPath(req.originalUrl),
    error: error instanceof Error ? error.message : String(error),
    stack: isProduction ? undefined : error instanceof Error ? error.stack : undefined
  });

  res.status(500).json({ code: 'internal', message: 'Internal Server Error', requestId: req.id });
};

/**
 * Callback URLs carry the shared secret as a path segment, so it must never reach a log line. Anyone
 * who can read the logs could otherwise forge payment confirmations.
 */
export function redactPath(url: string): string {
  return url.replace(/(\/(?:mpesa(?:\/c2b)?|hooks\/pay)\/)[^/?]+(?=\/(?:confirmation|validation))/, '$1[redacted]');
}
