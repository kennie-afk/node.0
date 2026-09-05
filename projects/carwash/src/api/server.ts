import { createApiApp } from './app';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { assertRlsIsEffective, closePool, pool } from '../persistence/pool';

async function main(): Promise<void> {
  await pool.query('SELECT 1');
  await assertRlsIsEffective();
  logger.info('database reachable');

  const server = createApiApp().listen(env.API_PORT, () => {
    logger.info('api listening', { port: env.API_PORT, environment: env.NODE_ENV });
  });

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutting down', { signal });
    const forced = setTimeout(() => process.exit(1), env.SHUTDOWN_GRACE_MS);
    forced.unref();
    server.close(async () => {
      await closePool().catch(() => undefined);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((error) => {
  logger.error('failed to start', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
