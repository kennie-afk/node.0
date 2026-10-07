import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProduction } from '../config/env';
import { logger } from '../common/logger';
import { AppError, UnauthorizedError } from '../domain/errors';
import { currentStatus } from '../billing/service';
import { writesAllowed } from '../billing/state';
import { can, Permission, Role } from '../domain/roles';
import { withOrg } from '../persistence/pool';

export interface Principal {
  userId: string;
  orgId: string;
  branchId: string | null;
  role: Role;
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

interface Standing {
  status: string;
  role: Role;
  branchId: string | null;
  at: number;
}
const STANDING_TTL_MS = 15_000;
const standing = new Map<string, Standing>();

/**
 * The token proves who signed in; the database says whether they still may. A disabled member of staff, or one
 * whose role changed, is honoured within seconds rather than when their token happens to expire.
 */
async function currentStanding(orgId: string, userId: string): Promise<Standing | null> {
  const key = `${orgId}:${userId}`;
  const cached = standing.get(key);
  if (cached && Date.now() - cached.at < STANDING_TTL_MS) return cached;
  const row = await withOrg(orgId, async (client) =>
    (await client.query('SELECT status, role, branch_id FROM users WHERE id = $1', [userId])).rows[0]
  );
  if (!row) {
    standing.delete(key);
    return null;
  }
  const fresh: Standing = { status: row.status, role: row.role, branchId: row.branch_id, at: Date.now() };
  standing.set(key, fresh);
  if (standing.size > 5000) standing.clear();
  return fresh;
}

/** Test seam and the moment a person is disabled: forget what was cached about them. */
export function forgetStanding(orgId: string, userId: string): void {
  standing.delete(`${orgId}:${userId}`);
}

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
    const now = await currentStanding(claims.orgId, claims.sub);
    if (!now || now.status !== 'active') {
      return next(new UnauthorizedError('This account is no longer active.'));
    }
    req.principal = { userId: claims.sub, orgId: claims.orgId, branchId: now.branchId, role: now.role };
    next();
  } catch (error) {
    next(error);
  }
};

export const requirePermission =
  (permission: Permission) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.principal || !can(req.principal.role, permission)) {
      return next(new AppError(403, 'forbidden', 'Your role does not allow this.'));
    }
    next();
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
 * A suspended (long-unpaid) organisation keeps every record and every read; it cannot change anything until it
 * pays. M-Pesa confirmations are NOT gated, so no money record is ever lost while an account is behind. Paying
 * reactivates immediately. Nothing is ever deleted.
 */
export const requireWritable = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const status = await currentStatus(req.principal!.orgId);
    if (!writesAllowed(status)) {
      return next(
        new AppError(402, 'subscription-suspended', 'This account is read-only until the Hazina subscription is paid. Your records are safe; open Billing to pay.')
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

  // Constraint violations are the caller's doing (a duplicate paybill number, a row still in use).
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === '23505' || pg.code === '23503') {
    const message = pg.code === '23505'
      ? pg.constraint === 'branches_paybill_unique'
        ? 'That paybill number is already registered to another organisation. If it is yours, contact Hazina support.'
        : 'That value is already in use.'
      : 'That record is still referred to by other records.';
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
