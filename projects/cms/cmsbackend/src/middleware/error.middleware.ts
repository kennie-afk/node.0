import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/errors';
import { MissingTenantError } from '../common/tenant-context';
import { logger } from '../common/logger';
import { isProduction } from '../config/env';

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
