import { QueryTypes } from 'sequelize';
import db from '@models';
import { isPostgres } from '../../common/tenant-db';
import { enqueueSystemJob } from './queue';

interface Schedule {
  name: string;
  everySeconds: number;
  /** Do not fire before this UTC hour (nightly work runs out of hours). */
  notBeforeHourUtc?: number;
  jobType: string;
  payload?: () => Record<string, unknown>;
}

export const SCHEDULES: Schedule[] = [
  { name: 'maintenance.purge', everySeconds: 3600, jobType: 'maintenance.purge' },
  { name: 'ledger.verify-all', everySeconds: 23 * 3600, notBeforeHourUtc: 2, jobType: 'ledger.verify-all', payload: () => ({ day: new Date().toISOString().slice(0, 10) }) }
];

/**
 * Atomically claims a run: the upsert only moves last_run_at forward when the interval has
 * elapsed, so of N workers ticking at once exactly one gets a row back.
 */
async function claimRun(name: string, everySeconds: number): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - everySeconds * 1000);
  if (!isPostgres(db.sequelize)) {
    // SQLite: single writer, and its driver cannot RETURNING from an INSERT; check then upsert.
    const last = (await db.sequelize.query('SELECT last_run_at FROM scheduler_state WHERE name = :name', { replacements: { name }, type: QueryTypes.SELECT })) as any[];
    if (last[0] && new Date(last[0].last_run_at) > cutoff) return false;
    await db.sequelize.query(
      'INSERT INTO scheduler_state (name, last_run_at) VALUES (:name, :now) ON CONFLICT (name) DO UPDATE SET last_run_at = :now',
      { replacements: { name, now } }
    );
    return true;
  }
  const rows = (await db.sequelize.query(
    `INSERT INTO scheduler_state (name, last_run_at) VALUES (:name, :now)
     ON CONFLICT (name) DO UPDATE SET last_run_at = :now WHERE scheduler_state.last_run_at <= :cutoff
     RETURNING name`,
    { replacements: { name, now, cutoff }, type: QueryTypes.SELECT, transaction: null }
  )) as unknown[];
  return rows.length > 0;
}

export async function runSchedulerTick(now = new Date()): Promise<string[]> {
  const fired: string[] = [];
  for (const schedule of SCHEDULES) {
    if (schedule.notBeforeHourUtc !== undefined && now.getUTCHours() < schedule.notBeforeHourUtc) continue;
    if (!(await claimRun(schedule.name, schedule.everySeconds))) continue;
    await enqueueSystemJob({ type: schedule.jobType, payload: schedule.payload?.() ?? {}, dedupeKey: `cron:${schedule.name}` });
    fired.push(schedule.name);
  }
  return fired;
}
