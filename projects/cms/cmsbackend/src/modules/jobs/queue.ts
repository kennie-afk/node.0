/**
 * The durable job queue. Producers call `enqueueJob` inside their own transaction, so the job
 * exists if and only if the business change committed (the transactional outbox pattern): a
 * receipt SMS is never sent for a contribution that rolled back, and never lost for one that
 * committed. Workers claim with FOR UPDATE SKIP LOCKED, so any number of them run side by side.
 */
import { QueryTypes, Transaction } from 'sequelize';
import db from '@models';
import { isPostgres } from '../../common/tenant-db';

export interface EnqueueInput {
  type: string;
  churchId?: number | null;
  payload?: Record<string, unknown>;
  runAt?: Date;
  /** At most one live (queued or running) job per church and key. */
  dedupeKey?: string;
  maxAttempts?: number;
}

export interface JobRow {
  id: number;
  churchId: number | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

function toRow(row: any): JobRow {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload ?? {};
  return {
    id: Number(row.id),
    churchId: row.church_id === null || row.church_id === undefined ? null : Number(row.church_id),
    type: row.type,
    payload,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts)
  };
}

/** Enqueue inside the caller's transaction. Returns the job id, or null when a live duplicate exists. */
export async function enqueueJob(t: Transaction, input: EnqueueInput): Promise<number | null> {
  const values = {
    type: input.type,
    churchId: input.churchId ?? null,
    payload: JSON.stringify(input.payload ?? {}),
    runAt: input.runAt ?? new Date(),
    dedupe: input.dedupeKey ?? null,
    max: input.maxAttempts ?? 8
  };
  if (!isPostgres(db.sequelize) && input.dedupeKey) {
    const live = await db.sequelize.query(
      `SELECT id FROM jobs WHERE COALESCE(church_id, 0) = :c AND dedupe_key = :d AND status IN ('queued','running')`,
      { replacements: { c: values.churchId ?? 0, d: values.dedupe }, transaction: t, type: QueryTypes.SELECT }
    );
    if (live.length > 0) return null;
  }
  const sql = `INSERT INTO jobs (type, church_id, payload, run_at, dedupe_key, max_attempts)
     VALUES (:type, :churchId, :payload, :runAt, :dedupe, :max)`;
  if (!isPostgres(db.sequelize)) {
    // The SQLite driver cannot return rows from an INSERT; read the rowid back on the same connection.
    await db.sequelize.query(sql, { replacements: values, transaction: t });
    const rows = (await db.sequelize.query('SELECT last_insert_rowid() AS id', { transaction: t, type: QueryTypes.SELECT })) as Array<{ id: number }>;
    return Number(rows[0].id);
  }
  const rows = (await db.sequelize.query(`${sql} ON CONFLICT DO NOTHING RETURNING id`, {
    replacements: values,
    transaction: t,
    type: QueryTypes.SELECT
  })) as Array<{ id: number }>;
  return rows[0] ? Number(rows[0].id) : null;
}

/** Enqueue from outside any tenant (the scheduler, fan-out): goes through the definer function. */
export async function enqueueSystemJob(input: EnqueueInput): Promise<number | null> {
  if (isPostgres(db.sequelize)) {
    const rows = (await db.sequelize.query('SELECT jobs_enqueue_system(:type, CAST(:payload AS jsonb), :churchId, :dedupe, :runAt) AS id', {
      replacements: {
        type: input.type,
        payload: JSON.stringify(input.payload ?? {}),
        churchId: input.churchId ?? null,
        dedupe: input.dedupeKey ?? null,
        runAt: input.runAt ?? null
      },
      type: QueryTypes.SELECT,
      transaction: null
    })) as Array<{ id: number | null }>;
    return rows[0]?.id ? Number(rows[0].id) : null;
  }
  return db.sequelize.transaction((t: Transaction) => enqueueJob(t, input));
}

export async function claimJobs(worker: string, batch: number, leaseSeconds: number): Promise<JobRow[]> {
  if (isPostgres(db.sequelize)) {
    const rows = (await db.sequelize.query('SELECT * FROM jobs_claim(:worker, :batch, :lease)', {
      replacements: { worker, batch, lease: leaseSeconds },
      type: QueryTypes.SELECT,
      transaction: null
    })) as any[];
    return rows.map(toRow);
  }
  // SQLite serialises writers, so a plain select-then-update is already exclusive.
  return db.sequelize.transaction(async (t: Transaction) => {
    await db.sequelize.query(`UPDATE jobs SET status = 'queued', locked_by = NULL, locked_at = NULL WHERE status = 'running' AND locked_at < :cutoff`, {
      replacements: { cutoff: new Date(Date.now() - leaseSeconds * 1000) },
      transaction: t
    });
    const rows = (await db.sequelize.query(`SELECT * FROM jobs WHERE status = 'queued' AND run_at <= :now ORDER BY run_at, id LIMIT :batch`, {
      replacements: { now: new Date(), batch },
      transaction: t,
      type: QueryTypes.SELECT
    })) as any[];
    for (const row of rows) {
      await db.sequelize.query(`UPDATE jobs SET status = 'running', locked_by = :worker, locked_at = :now, attempts = attempts + 1 WHERE id = :id`, {
        replacements: { worker, now: new Date(), id: row.id },
        transaction: t
      });
      row.attempts = Number(row.attempts) + 1;
    }
    return rows.map(toRow);
  });
}

export async function completeJob(id: number): Promise<void> {
  if (isPostgres(db.sequelize)) {
    await db.sequelize.query('SELECT jobs_finish(:id)', { replacements: { id }, type: QueryTypes.SELECT, transaction: null });
    return;
  }
  await db.sequelize.query(`UPDATE jobs SET status = 'done', finished_at = :now, locked_by = NULL, locked_at = NULL, last_error = NULL WHERE id = :id`, {
    replacements: { id, now: new Date() }
  });
}

/** Exponential backoff with a ceiling: 10s, 20s, 40s ... one hour. */
export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 10 * 2 ** Math.max(0, attempts - 1));
}

/** Returns the resulting status: 'queued' (will retry) or 'dead' (attempts exhausted). */
export async function failJob(id: number, attempts: number, message: string): Promise<'queued' | 'dead'> {
  const delay = backoffSeconds(attempts);
  if (isPostgres(db.sequelize)) {
    const rows = (await db.sequelize.query('SELECT jobs_fail(:id, :message, :delay) AS status', {
      replacements: { id, message, delay },
      type: QueryTypes.SELECT,
      transaction: null
    })) as Array<{ status: 'queued' | 'dead' }>;
    return rows[0].status;
  }
  const row = (await db.sequelize.query('SELECT attempts, max_attempts FROM jobs WHERE id = :id', { replacements: { id }, type: QueryTypes.SELECT })) as any[];
  const dead = Number(row[0].attempts) >= Number(row[0].max_attempts);
  await db.sequelize.query(
    `UPDATE jobs SET status = :status, run_at = :runAt, last_error = :message, locked_by = NULL, locked_at = NULL, finished_at = :finished WHERE id = :id`,
    {
      replacements: {
        id,
        status: dead ? 'dead' : 'queued',
        runAt: dead ? new Date() : new Date(Date.now() + delay * 1000),
        message: message.slice(0, 2000),
        finished: dead ? new Date() : null
      }
    }
  );
  return dead ? 'dead' : 'queued';
}

export interface QueueStats {
  queued: number;
  running: number;
  dead: number;
  oldestQueuedAgeSeconds: number;
}

export async function queueStats(): Promise<QueueStats> {
  const stats: QueueStats = { queued: 0, running: 0, dead: 0, oldestQueuedAgeSeconds: 0 };
  const rows = (await db.sequelize.query(
    isPostgres(db.sequelize)
      ? 'SELECT * FROM jobs_stats()'
      : `SELECT status, COUNT(*) AS n, COALESCE((julianday('now') - julianday(MIN(run_at))) * 86400, 0) AS oldest_age_seconds FROM jobs WHERE status IN ('queued','running','dead') GROUP BY status`,
    { type: QueryTypes.SELECT, transaction: null }
  )) as any[];
  for (const row of rows) {
    const n = Number(row.n);
    if (row.status === 'queued') {
      stats.queued = n;
      stats.oldestQueuedAgeSeconds = Math.max(0, Number(row.oldest_age_seconds));
    } else if (row.status === 'running') stats.running = n;
    else if (row.status === 'dead') stats.dead = n;
  }
  return stats;
}

export async function purgeOld(doneOlderThanDays: number, idempotencyOlderThanHours: number): Promise<{ jobsDeleted: number; keysDeleted: number }> {
  if (isPostgres(db.sequelize)) {
    const rows = (await db.sequelize.query('SELECT * FROM jobs_purge(:d, :h)', {
      replacements: { d: doneOlderThanDays, h: idempotencyOlderThanHours },
      type: QueryTypes.SELECT,
      transaction: null
    })) as any[];
    return { jobsDeleted: Number(rows[0].jobs_deleted), keysDeleted: Number(rows[0].keys_deleted) };
  }
  const [, jobsMeta] = (await db.sequelize.query(`DELETE FROM jobs WHERE status = 'done' AND finished_at < :c`, {
    replacements: { c: new Date(Date.now() - doneOlderThanDays * 86_400_000) }
  })) as any;
  const keys = (await db.sequelize.query(`DELETE FROM idempotency_keys WHERE created_at < :c RETURNING 1 AS x`, {
    replacements: { c: new Date(Date.now() - idempotencyOlderThanHours * 3_600_000) },
    type: QueryTypes.SELECT
  })) as any[];
  void jobsMeta;
  return { jobsDeleted: 0, keysDeleted: keys.length };
}

// ---- handler registry ------------------------------------------------------------------------

export interface JobContext {
  job: JobRow;
  /** The church's id for tenant jobs; null for system jobs. */
  churchId: number | null;
}
export type JobHandler = (payload: Record<string, unknown>, context: JobContext) => Promise<void>;

const handlers = new Map<string, JobHandler>();

/**
 * Modules register handlers for the job types they enqueue, at import time. A tenant job's handler
 * runs inside runAsTenant (one transaction stamped with the church, committed on success); a
 * system job's handler runs with no tenant and must use definer functions or the church registry.
 */
export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getJobHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}

export function registeredJobTypes(): string[] {
  return [...handlers.keys()].sort();
}
