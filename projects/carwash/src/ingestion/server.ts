import express from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { closePool, pool } from '../persistence/pool';
import { requestContext, errorHandler, notFound } from '../api/middleware';
import { parseBatch } from './batch';
import { ingestBatch, ingestPlates } from './service';
import { parsePlateBatch } from './plates';

export function createIngestionApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(helmet());
  app.use(express.json({ limit: '2mb' }));

  app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.get('/readyz', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not-ready', reason: 'database unreachable' });
    }
  });

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: env.TELEMETRY_RATE_LIMIT_PER_MINUTE,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => String(req.header('x-device-id') ?? ipKeyGenerator(req.ip ?? 'unknown'))
    })
  );

  app.post('/v1/telemetry', async (req, res, next) => {
    try {
      const batch = parseBatch(req.body);
      const outcome = await ingestBatch(
        req.header('x-device-id'),
        req.header('x-device-secret'),
        batch
      );

      if (outcome.sequences.missing.length > 0) {
        logger.warn('telemetry sequence gap', {
          requestId: req.id,
          deviceId: batch.deviceId,
          missing: outcome.sequences.missing.length,
          expectedFrom: outcome.sequences.expectedFrom
        });
      }

      res.status(202).json({
        deviceId: batch.deviceId,
        accepted: outcome.accepted,
        stored: outcome.stored,
        duplicates: outcome.duplicates,
        minutesFolded: outcome.minutesFolded,
        missingSequences: outcome.sequences.missing
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/plates', async (req, res, next) => {
    try {
      const outcome = await ingestPlates(
        req.header('x-device-id'),
        req.header('x-device-secret'),
        parsePlateBatch(req.body)
      );
      res.status(202).json(outcome);
    } catch (error) {
      next(error);
    }
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function main(): Promise<void> {
  await pool.query('SELECT 1');
  const server = createIngestionApp().listen(env.INGESTION_PORT, () => {
    logger.info('ingestion listening', { port: env.INGESTION_PORT });
  });

  const stop = () => {
    server.close(async () => {
      await closePool().catch(() => undefined);
      process.exit(0);
    });
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.argv[1]?.includes('ingestion/server')) {
  main().catch((error) => {
    logger.error('ingestion failed to start', {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
}
