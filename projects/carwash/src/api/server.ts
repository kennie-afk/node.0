import { createApiApp } from './app';
import { assertBillingSafeForProduction, env } from '../config/env';
import { logger } from '../common/logger';
import { assertRlsIsEffective, closePool, pool } from '../persistence/pool';
import { runBillingCycle } from '../billing/service';
import { runDailyCloses } from '../reconciliation/schedule';
import { keepPartitionsAhead } from '../persistence/partitions';
import { keepMaintained } from '../persistence/maintenance';

async function main(): Promise<void> {
  assertBillingSafeForProduction();
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

  // Reconciles each site's finished day exactly once. Checked hourly so a site in any time zone is
  // closed shortly after its own midnight; a day already closed is skipped, so replicas and reruns agree.
  const closeTimer = setInterval(() => {
    runDailyCloses()
      .then((result) => logger.info('daily close', { ...result }))
      .catch((error) => logger.error('daily close failed', { error: error instanceof Error ? error.message : String(error) }));
  }, 60 * 60_000);
  closeTimer.unref();

  // Monthly partitions are created ahead of time here, not only when migrations run.
  const partitionTimer = keepPartitionsAhead();
  const maintenanceTimer = keepMaintained();
  if (env.BILLING_MODE === 'mock' && env.NODE_ENV === 'production') {
    logger.warn('BILLING_MODE=mock in production: owners can simulate payments and nothing real is collected');
  }

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutting down', { signal });
    clearInterval(billingTimer);
    clearInterval(closeTimer);
    clearInterval(partitionTimer);
    clearInterval(maintenanceTimer);
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
