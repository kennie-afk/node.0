/**
 * Scheduled upkeep for the tables that only grow: telemetry roll-up and retention, and clean-up of
 * idempotency keys. Started from the API and the ingestion service like partitions.ts; an advisory lock
 * makes every replica safe to run it, because only one holds the lock at a time and the work is idempotent.
 *
 *   per-minute telemetry  -> rolled into per-hour rows, then deleted, once older than RETENTION_TELEMETRY_MINUTE_DAYS
 *   per-hour telemetry    -> deleted after RETENTION_TELEMETRY_HOUR_DAYS
 *   raw telemetry         -> a monthly partition is dropped once the WHOLE month is older than RETENTION_TELEMETRY_RAW_DAYS
 *   idempotency keys      -> deleted after RETENTION_IDEMPOTENCY_DAYS
 *
 * What is deliberately NOT here: job_events (the audit log), payments, discrepancies and day_closes. Those
 * are the evidence and are never expired by this job.
 */
import { env } from '../config/env';
import { logger } from '../common/logger';
import { pool, withMigrator, withOrg, withoutTenant } from './pool';

export const MAINTENANCE_LOCK_KEY = 8_410_018;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface RetentionConfig {
  minuteDays: number;
  hourDays: number;
  rawDays: number;
  idempotencyDays: number;
}

export function retentionFromEnv(): RetentionConfig {
  return {
    minuteDays: env.RETENTION_TELEMETRY_MINUTE_DAYS,
    hourDays: env.RETENTION_TELEMETRY_HOUR_DAYS,
    rawDays: env.RETENTION_TELEMETRY_RAW_DAYS,
    idempotencyDays: env.RETENTION_IDEMPOTENCY_DAYS
  };
}

export interface Cutoffs {
  /** minute rows strictly before this instant are rolled up; always a whole hour so no hour is split */
  minuteBefore: Date;
  hourBefore: Date;
  rawBefore: Date;
  idempotencyBefore: Date;
}

export function cutoffs(now: Date, config: RetentionConfig): Cutoffs {
  const minute = now.getTime() - config.minuteDays * DAY_MS;
  return {
    minuteBefore: new Date(Math.floor(minute / HOUR_MS) * HOUR_MS),
    hourBefore: new Date(now.getTime() - config.hourDays * DAY_MS),
    rawBefore: new Date(now.getTime() - config.rawDays * DAY_MS),
    idempotencyBefore: new Date(now.getTime() - config.idempotencyDays * DAY_MS)
  };
}

/** `telemetry_2026_03` is expired only when all of March 2026 is before the cutoff. */
export function partitionExpired(name: string, rawBefore: Date): boolean {
  const match = /^telemetry_(\d{4})_(\d{2})$/.exec(name);
  if (!match) return false;
  const monthEnd = Date.UTC(Number(match[1]), Number(match[2]), 1);
  return monthEnd <= rawBefore.getTime();
}

export interface MaintenanceResult {
  skipped: boolean;
  minuteRowsRolledUp: number;
  hourRowsDeleted: number;
  partitionsDropped: string[];
  idempotencyKeysDeleted: number;
}

const MAX_DAYS_PER_SITE_PER_RUN = 40;

/**
 * Moves one site's per-minute rows older than `before` into per-hour rows, a day at a time. The delete and
 * the insert are ONE statement, so a crash cannot leave minutes both counted in an hour and still present,
 * and re-running after a partial run just continues from the oldest remaining minute.
 */
export async function rollUpSite(orgId: string, siteId: string, before: Date): Promise<number> {
  let moved = 0;
  for (let chunk = 0; chunk < MAX_DAYS_PER_SITE_PER_RUN; chunk += 1) {
    const done = await withOrg(orgId, async (client) => {
      const oldest = await client.query('SELECT min(bucket) AS first FROM telemetry_minute WHERE site_id = $1 AND bucket < $2', [siteId, before]);
      const first: Date | null = oldest.rows[0]?.first ?? null;
      if (!first) return null;
      const start = new Date(Math.floor(first.getTime() / DAY_MS) * DAY_MS);
      const end = new Date(Math.min(start.getTime() + DAY_MS, before.getTime()));
      const result = await client.query(
        `WITH gone AS (
           DELETE FROM telemetry_minute WHERE site_id = $1 AND bucket >= $2 AND bucket < $3
           RETURNING bay_id, bucket, metric, total, samples
         ), hourly AS (
           INSERT INTO telemetry_hour (org_id, site_id, bay_id, bucket, metric, total, samples)
           SELECT $4::uuid, $1::uuid, bay_id, date_trunc('hour', bucket), metric, sum(total), sum(samples)::int
             FROM gone GROUP BY bay_id, date_trunc('hour', bucket), metric
           ON CONFLICT (site_id, bucket, metric, bay_key)
           DO UPDATE SET total = telemetry_hour.total + EXCLUDED.total, samples = telemetry_hour.samples + EXCLUDED.samples
           RETURNING 1
         )
         SELECT (SELECT count(*) FROM gone) AS moved`,
        [siteId, start, end, orgId]
      );
      return Number(result.rows[0].moved);
    });
    if (done === null) break;
    moved += done;
  }
  return moved;
}

async function expiredPartitions(client: { query: (sql: string) => Promise<{ rows: { relname: string }[] }> }, rawBefore: Date): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT c.relname FROM pg_inherits i
       JOIN pg_class c ON c.oid = i.inhrelid
       JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'telemetry' ORDER BY c.relname`
  );
  return rows.map((row) => row.relname).filter((name) => partitionExpired(name, rawBefore));
}

export async function runMaintenance(now: Date = new Date(), config: RetentionConfig = retentionFromEnv()): Promise<MaintenanceResult> {
  const limits = cutoffs(now, config);
  const result: MaintenanceResult = { skipped: false, minuteRowsRolledUp: 0, hourRowsDeleted: 0, partitionsDropped: [], idempotencyKeysDeleted: 0 };

  // The lock is held on a connection of its own from the application pool, not the single migration
  // connection, so a long roll-up never makes the partition timer wait for that one connection.
  const lockClient = await pool.connect();
  try {
    const lock = await lockClient.query('SELECT pg_try_advisory_lock($1) AS taken', [MAINTENANCE_LOCK_KEY]);
    if (!lock.rows[0].taken) return { ...result, skipped: true };
    try {
      const directory = await withoutTenant(async (client) => (await client.query('SELECT org_id, site_id FROM site_directory()')).rows);
      for (const entry of directory) {
        result.minuteRowsRolledUp += await rollUpSite(entry.org_id, entry.site_id, limits.minuteBefore);
        result.hourRowsDeleted += await withOrg(entry.org_id, async (client) =>
          (await client.query('DELETE FROM telemetry_hour WHERE site_id = $1 AND bucket < $2', [entry.site_id, limits.hourBefore])).rowCount ?? 0
        );
      }

      // dropping a partition is DDL, which the application role cannot do; it takes the migration role briefly
      await withMigrator(async (client) => {
        for (const name of await expiredPartitions(client, limits.rawBefore)) {
          if (!/^telemetry_\d{4}_\d{2}$/.test(name)) continue;
          await client.query(`DROP TABLE IF EXISTS ${name}`);
          result.partitionsDropped.push(name);
        }
      });

      result.idempotencyKeysDeleted = (await pool.query('DELETE FROM idempotency_keys WHERE created_at < $1', [limits.idempotencyBefore])).rowCount ?? 0;
      return result;
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [MAINTENANCE_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
}

export function keepMaintained(intervalMs = env.MAINTENANCE_INTERVAL_MINUTES * 60_000): NodeJS.Timeout {
  const run = () =>
    runMaintenance()
      .then((outcome) => {
        if (!outcome.skipped) logger.info('maintenance', { ...outcome });
      })
      .catch((error) => logger.error('maintenance failed', { error: error instanceof Error ? error.message : String(error) }));
  // not at the instant of boot: let the process finish starting and the partition timer go first
  const first = setTimeout(run, 60_000);
  first.unref();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return timer;
}
