import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { checkReadiness } from '../persistence/readiness';
import { errorHandler, notFound, requestContext } from './middleware';
import routes from './routes';
import readRoutes from './read';
import manageRoutes from './manage';
import signupRoutes from './signup';
import billingRoutes from './billing';
import onboardingRoutes from './onboarding';
import accountRoutes from './account';
import operationsRoutes from './operations';

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
      const state = await checkReadiness();
      if (state.ready) return res.status(200).json({ status: 'ready', migration: state.version });
      res.status(503).json({ status: 'not-ready', reason: state.reason, pending: state.pending });
    } catch {
      res.status(503).json({ status: 'not-ready', reason: 'database unreachable' });
    }
  });

  app.use(
    rateLimit({ windowMs: 60_000, limit: env.API_RATE_LIMIT_PER_MINUTE, standardHeaders: true, legacyHeaders: false })
  );

  app.use('/v1', routes);
  app.use('/v1', readRoutes);
  app.use('/v1', manageRoutes);
  app.use('/v1', signupRoutes);
  app.use('/v1', billingRoutes);
  app.use('/v1', onboardingRoutes);
  app.use('/v1', accountRoutes);
  app.use('/v1', operationsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
