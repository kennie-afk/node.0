import express from 'express';
import helmet from 'helmet';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { closePool, pool } from '../persistence/pool';
import { requestContext, errorHandler, notFound } from '../api/middleware';
import { parseBatch } from './batch';

export function createIngestionApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(helmet());
  app.use(express.json({ limit: '2mb' }));

  app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.post('/v1/telemetry', (req, res, next) => {
    try {
      const batch = parseBatch(req.body);
      res.status(202).json({ accepted: batch.readings.length, deviceId: batch.deviceId });
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
