import { createApiApp } from './app';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { assertRlsIsEffective, closePool, pool } from '../persistence/pool';
import { runBillingCycle } from '../billing/service';

async function main(): Promise<void> {
  await pool.query('SELECT 1');
  await assertRlsIsEffective();
  logger.info('database reachable');

  const server = createApiApp().listen(env.API_PORT, () => {
    logger.info('api listening', { port: env.API_PORT, environment: env.NODE_ENV });
  });

  // Issues invoices that have come due and mirrors subscription statuses. Idempotent, so several
  // replicas running it at once is harmless. Gating never depends on it: the status that blocks or
  // allows a request is computed from dates at request time.
  const billingTimer = setInterval(() => {
    runBillingCycle()
      .then((result) => logger.info('billing cycle', { ...result }))
      .catch((error) => logger.error('billing cycle failed', { error: error instanceof Error ? error.message : String(error) }));
  }, env.BILLING_RUN_INTERVAL_MINUTES * 60_000);
  billingTimer.unref();
  if (env.BILLING_MODE === 'mock' && env.NODE_ENV === 'production') {
    logger.warn('BILLING_MODE=mock in production: owners can simulate payments and nothing real is collected');
  }

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutting down', { signal });
    clearInterval(billingTimer);
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
