import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { pool } from '../persistence/pool';
import { errorHandler, notFound, requestContext } from './middleware';
import authRoutes from './auth';
import opsRoutes from './ops';
import rosterRoutes from './roster';
import moneyRoutes from './money';
import mpesaRoutes from './mpesa';
import exportsRoutes from './exports';
import settingsRoutes from './settings';
import signupRoutes from './signup';
import billingRoutes from './billing';

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
        !origin || env.CORS_ORIGINS.includes(origin) ? callback(null, true) : callback(new Error('Not allowed by CORS')),
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

  // Every request from the console reaches this API from the console's one address, so an IP-keyed limit would make every
  // organisation share one allowance. Signed-in traffic is therefore limited per person (token verified, so a forged subject
  // cannot buy a fresh allowance); anything else falls back to the caller's address.
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: env.API_RATE_LIMIT_PER_MINUTE,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const header = req.headers.authorization;
        if (header?.startsWith('Bearer ')) {
          try {
            const claims = jwt.verify(header.slice(7).trim(), env.JWT_SECRET) as { sub?: string };
            if (typeof claims.sub === 'string') return `user:${claims.sub}`;
          } catch {
            /* an invalid token is limited like an anonymous caller */
          }
        }
        return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
      }
    })
  );

  app.use('/v1', authRoutes);
  app.use('/v1', signupRoutes);
  app.use('/v1', billingRoutes);
  app.use('/v1', opsRoutes);
  app.use('/v1', rosterRoutes);
  app.use('/v1', moneyRoutes);
  app.use('/v1', mpesaRoutes);
  app.use('/v1', exportsRoutes);
  app.use('/v1', settingsRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
