/**
 * Daily jobs: interest accrual, then penalties, then (optionally) SMS reminders, once a day per organisation, after
 * DAILY_JOBS_HOUR Nairobi time. Safe on any number of replicas: each organisation's run takes a session advisory lock
 * (pg_try_advisory_lock) and an instance that cannot get it moves on, and every job is idempotent anyway (an instalment is
 * accrued once, a penalty is charged once per instalment per month), so a missed or repeated run is harmless.
 */
import { pool, withOrg, withoutTenant } from '../persistence/pool';
import { logger } from '../common/logger';
import { env } from '../config/env';
import { SYSTEM_ACTOR, runInterestAccrual, runPenalties } from './service';
import { sendReminders } from '../notify/reminders';

export interface DailyResult {
  organisations: number;
  ran: number;
  skipped: number;
  failed: number;
}

/** Two int4 keys for the advisory lock: a fixed namespace and a hash of the organisation id. */
export function lockKey(orgId: string): [number, number] {
  let h = 0;
  for (const ch of orgId) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return [0x485a4e41 /* 'HZNA' */, h];
}

export async function nairobiNow(): Promise<{ day: string; hour: number }> {
  const { rows } = await pool.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS day, extract(hour FROM now() AT TIME ZONE 'Africa/Nairobi')::int AS hour`);
  return { day: rows[0].day as string, hour: Number(rows[0].hour) };
}

/** One organisation's day: skipped if it already finished today or another instance holds it. */
export async function runDailyForOrg(orgId: string, day: string, opts: { force?: boolean } = {}): Promise<'ran' | 'skipped'> {
  const lock = await pool.connect();
  const [k1, k2] = lockKey(orgId);
  try {
    const got = (await lock.query('SELECT pg_try_advisory_lock($1, $2) AS ok', [k1, k2])).rows[0].ok as boolean;
    if (!got) return 'skipped';
    try {
      if (!opts.force) {
        const done = await withOrg(orgId, async (client) => (await client.query('SELECT 1 FROM penalty_runs WHERE run_date = $1 AND daily_jobs_done_at IS NOT NULL', [day])).rows[0]);
        if (done) return 'skipped';
      }
      await runInterestAccrual(orgId, SYSTEM_ACTOR, day);
      await runPenalties(orgId, SYSTEM_ACTOR, day);
      if (env.SMS_REMINDERS_AUTO) await sendReminders(orgId, day, { upcomingDays: env.SMS_REMINDER_UPCOMING_DAYS });
      await withOrg(orgId, (client) => client.query(
        `INSERT INTO penalty_runs (org_id, run_date, daily_jobs_done_at) VALUES ($1, $2, now()) ON CONFLICT (org_id, run_date) DO UPDATE SET daily_jobs_done_at = now()`, [orgId, day]
      ));
      return 'ran';
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1, $2)', [k1, k2]);
    }
  } finally {
    lock.release();
  }
}

export async function runDailyJobs(opts: { force?: boolean } = {}): Promise<DailyResult> {
  const now = await nairobiNow();
  const result: DailyResult = { organisations: 0, ran: 0, skipped: 0, failed: 0 };
  if (!opts.force && now.hour < env.DAILY_JOBS_HOUR) return result;
  const orgs = await withoutTenant(async (client) => (await client.query('SELECT org_id FROM lending_org_ids()')).rows.map((r) => r.org_id as string));
  result.organisations = orgs.length;
  for (const orgId of orgs) {
    try {
      if ((await runDailyForOrg(orgId, now.day, opts)) === 'ran') result.ran += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      logger.error('daily jobs failed for an organisation', { orgId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

/** Starts the check loop; the caller clears the returned timer on shutdown. */
export function startDailyJobs(): NodeJS.Timeout | null {
  if (!env.DAILY_JOBS_ENABLED) return null;
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    runDailyJobs()
      .then((r) => { if (r.ran > 0 || r.failed > 0) logger.info('daily jobs', { ...r }); })
      .catch((error) => logger.error('daily jobs failed', { error: error instanceof Error ? error.message : String(error) }))
      .finally(() => { running = false; });
  };
  const timer = setInterval(tick, env.DAILY_JOBS_CHECK_MINUTES * 60_000);
  timer.unref();
  setTimeout(tick, 5_000).unref();
  return timer;
}
