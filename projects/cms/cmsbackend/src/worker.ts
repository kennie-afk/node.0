import 'module-alias/register';
import db from '@models';
import { assertProvidersSafeForProduction, env } from './config/env';
import { logger } from './common/logger';
import { observePool, startMetricsServer, stopMetricsServer } from './common/metrics';
// Importing the route registry loads every module's services, and with them every job handler
// they register; the worker needs no list of its own.
import './modules/route-registry';
import { Worker } from './modules/jobs/worker';
import { registeredJobTypes } from './modules/jobs/queue';

async function main(): Promise<void> {
  await db.sequelize.authenticate();
  for (const warning of assertProvidersSafeForProduction()) logger.warn(warning);
  startMetricsServer(() => observePool(db.sequelize));
  const worker = new Worker({ concurrency: env.WORKER_CONCURRENCY });
  worker.start();
  logger.info('job handlers registered', { types: registeredJobTypes() });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('worker shutting down', { signal });
    const forced = setTimeout(() => {
      logger.error('graceful shutdown timed out');
      process.exit(1);
    }, env.SHUTDOWN_GRACE_MS);
    forced.unref();
    await worker.stop();
    await stopMetricsServer();
    await db.sequelize.close();
    process.exit(0);
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void shutdown(signal));
}

main().catch((error) => {
  logger.error('worker failed to start', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
