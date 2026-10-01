import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { logger } from '../common/logger';

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS ?? 500);

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    // A healthy, fast request is routine and already counted by the Prometheus metrics; writing a
    // line for every one costs real CPU at volume. Errors and slow requests are always logged at
    // info, and LOG_LEVEL=debug brings every request back.
    const routine = res.statusCode < 400 && durationMs < SLOW_REQUEST_MS;
    logger[routine ? 'debug' : 'info']('request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      churchId: req.user?.churchId
    });
  });

  next();
};
