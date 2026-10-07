import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { pool } from '../persistence/pool';
import { shippedMigrations } from '../persistence/shipped';
import { errorHandler, notFound, requestContext } from './middleware';
import authRoutes from './auth';
import membersRoutes from './members';
import savingsRoutes from './savings';
import loansRoutes from './loans';
import ledgerRoutes from './ledger';
import mpesaRoutes from './mpesa';
import intakeRoutes from './intake';
import returnsRoutes from './returns';
import closingRoutes from './closing';
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
  // statement uploads and member imports arrive as base64 inside JSON; everything else is small
  app.use(['/v1/intake/statement', '/v1/members/import', '/v1/mpesa/reconciliation/statement'], express.json({ limit: '9mb' }));
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

  // Ready means: the database answers AND every migration this build ships has been applied (an old schema under a new build
  // would fail on the first request that touches a new column, so the instance is kept out of rotation instead).
  app.get('/readyz', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
    } catch {
      return res.status(503).json({ status: 'not-ready', reason: 'database unreachable' });
    }
    try {
      const shipped = await shippedMigrations();
      const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
      const applied = new Set(rows.map((r) => r.name as string));
      const pending = shipped.filter((name) => !applied.has(name));
      const latest = rows.length > 0 ? (rows[rows.length - 1].name as string) : null;
      if (pending.length > 0) return res.status(503).json({ status: 'not-ready', reason: 'migrations pending', pending, latestApplied: latest });
      return res.status(200).json({ status: 'ready', schemaVersion: latest });
    } catch {
      return res.status(503).json({ status: 'not-ready', reason: 'schema version unreadable' });
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
  app.use('/v1', membersRoutes);
  app.use('/v1', savingsRoutes);
  app.use('/v1', loansRoutes);
  app.use('/v1', ledgerRoutes);
  app.use('/v1', closingRoutes);
  app.use('/v1', mpesaRoutes);
  app.use('/v1', intakeRoutes);
  app.use('/v1', returnsRoutes);
  app.use('/v1', exportsRoutes);
  app.use('/v1', settingsRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
