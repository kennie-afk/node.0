import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/errors';
import { MissingTenantError } from '../common/tenant-context';
import { logger } from '../common/logger';
import { isProduction } from '../config/env';

/**
 * Constraint violations are the caller's problem, not a server fault. Only the offending
 * field names are reported, never the values or the SQL.
 */
function translateDatabaseError(error: unknown): { status: number; message: string } | null {
  const name = error instanceof Error ? error.name : '';
  const fields = (): string =>
    ((error as { errors?: Array<{ path?: string | null }> }).errors ?? [])
      .map((item) => item.path)
      .filter((path): path is string => Boolean(path) && path !== 'church_id')
      .join(', ');

  if (name === 'SequelizeUniqueConstraintError') {
    const which = fields();
    return { status: 409, message: which ? `${which} is already in use` : 'that record already exists' };
  }
  if (name === 'SequelizeForeignKeyConstraintError') {
    return { status: 409, message: 'the record refers to, or is still used by, another record' };
  }
  if (name === 'SequelizeValidationError') {
    const which = fields();
    return { status: 400, message: which ? `invalid value for ${which}` : 'the record is not valid' };
  }
  return null;
}

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({ message: `No route matches ${req.method} ${req.originalUrl}` });
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof ApiError) {
    logger.warn('request rejected', {
      requestId: req.id,
      status: error.statusCode,
      reason: error.message
    });
    return res.status(error.statusCode).json({ message: error.message, requestId: req.id });
  }

  const database = translateDatabaseError(error);
  if (database) {
    logger.warn('request rejected', { requestId: req.id, status: database.status, reason: database.message });
    return res.status(database.status).json({ message: database.message, requestId: req.id });
  }

  if (error instanceof MissingTenantError) {
    logger.error('tenant scope missing', { requestId: req.id, path: req.originalUrl });
    return res.status(500).json({ message: 'Internal Server Error', requestId: req.id });
  }

  logger.error('unhandled error', {
    requestId: req.id,
    path: req.originalUrl,
    error: error instanceof Error ? error.message : String(error),
    stack: isProduction ? undefined : error instanceof Error ? error.stack : undefined
  });

  res.status(500).json({ message: 'Internal Server Error', requestId: req.id });
};
