import { createApp } from './app';
import { env } from './config/env';
import { logger } from './common/logger';
import db from '@models';

async function main(): Promise<void> {
  await db.sequelize.authenticate();
  logger.info('database connected');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info('server listening', { port: env.PORT, environment: env.NODE_ENV });
  });

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('shutting down', { signal });

    const forced = setTimeout(() => {
      logger.error('graceful shutdown timed out, exiting now');
      process.exit(1);
    }, env.SHUTDOWN_GRACE_MS);
    forced.unref();

    server.close(async () => {
      try {
        await db.sequelize.close();
        logger.info('shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('shutdown failed', {
          error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
      }
    });
  }

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => void shutdown(signal));
  }
}

main().catch((error) => {
  logger.error('failed to start', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
