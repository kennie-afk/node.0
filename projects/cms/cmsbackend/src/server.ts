import { createApp } from './app';
import { env } from './config/env';
import { logger } from './common/logger';
import db from '@models';
import { closeRateLimitStore } from './middleware/rate-limit.middleware';
import { observePool, startMetricsServer, stopMetricsServer } from './common/metrics';
import { isPostgres } from './common/tenant-db';
import { assertProvidersSafeForProduction, isProduction } from './config/env';

/**
 * Row-level security does not apply to superusers, BYPASSRLS roles or (unless forced) table
 * owners. Connecting as one of those makes every tenant policy silently inert, so in production
 * the process refuses to start rather than run without the protection it is documented to have.
 */
async function assertUnprivilegedDatabaseRole(): Promise<void> {
  if (!isPostgres(db.sequelize)) return;
  const [rows] = (await db.sequelize.query(
    `SELECT r.rolname, r.rolsuper, r.rolbypassrls,
            EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'journal_entries' AND c.relowner = r.oid) AS owns_tables
       FROM pg_roles r WHERE r.rolname = current_user`
  )) as [Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean }>, unknown];
  const role = rows[0];
  if (!role || !(role.rolsuper || role.rolbypassrls || role.owns_tables)) return;
  const reason = `database role "${role.rolname}" is ${role.rolsuper ? 'a superuser' : role.rolbypassrls ? 'BYPASSRLS' : 'the table owner'}, which disables row-level security`;
  if (isProduction && process.env.ALLOW_PRIVILEGED_DB_ROLE !== 'true') {
    throw new Error(`${reason}. Connect as the application role (APP_DB_USER), or set ALLOW_PRIVILEGED_DB_ROLE=true to override knowingly.`);
  }
  logger.warn(`tenant isolation in the database is NOT enforced: ${reason}`);
}

async function main(): Promise<void> {
  await db.sequelize.authenticate();
  logger.info('database connected');
  await assertUnprivilegedDatabaseRole();
  for (const warning of assertProvidersSafeForProduction()) logger.warn(warning);
  startMetricsServer(() => observePool(db.sequelize));

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
        await closeRateLimitStore();
        await stopMetricsServer();
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
