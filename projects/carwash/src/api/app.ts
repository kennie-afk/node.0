import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { pool } from '../persistence/pool';
import { errorHandler, notFound, requestContext } from './middleware';
import routes from './routes';

export function createApiApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestContext);
  app.use(helmet());
  app.use(express.json({ limit: '512kb' }));
  app.use(
    cors({
      origin: (origin, callback) =>
        !origin || env.CORS_ORIGINS.includes(origin)
          ? callback(null, true)
          : callback(new Error('Not allowed by CORS')),
      credentials: true
    })
  );

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  app.get('/readyz', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not-ready', reason: 'database unreachable' });
    }
  });

  app.use(
    rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false })
  );

  app.use('/v1', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
