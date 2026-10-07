import { withMigrator } from './pool';
import { logger } from '../common/logger';

// Any constant will do; it only has to be the same in every process so that replicas take turns.
const PARTITION_LOCK_KEY = 8_410_017;

/**
 * Makes sure the monthly partitions of job_events and telemetry exist for the coming months.
 *
 * They used to be created only when migrations ran, so a deployment that was not migrated for four
 * months would start failing every insert with "no partition of relation found for row". The function
 * is idempotent and takes an advisory lock, so every replica can call it on a timer without two of
 * them creating the same table at once.
 */
export async function ensurePartitions(months = 3): Promise<boolean> {
  return withMigrator(async (client) => {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS taken', [PARTITION_LOCK_KEY]);
    if (!rows[0].taken) return false;
    try {
      await client.query('SELECT ensure_upcoming_partitions($1)', [months]);
      return true;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [PARTITION_LOCK_KEY]);
    }
  });
}

export function keepPartitionsAhead(intervalMs = 6 * 60 * 60_000): NodeJS.Timeout {
  const run = () =>
    ensurePartitions().catch((error) =>
      logger.error('could not create upcoming partitions', { error: error instanceof Error ? error.message : String(error) })
    );
  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return timer;
}
