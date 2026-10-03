/**
 * Sample data for a brand-new owner: one believable site with two weeks of jobs, payments, water
 * readings and plate captures, so the first hour of Forecourt shows what it finds before any real
 * device or till is connected.
 *
 * Everything is flagged `is_demo`, labelled "(sample)", has no usable phone number, no sign-in, no
 * device secret and no till number, so it can never be mistaken for or confused with real records.
 * Flags are produced by the real reconciliation engine over the sample days, not typed in.
 * It is refused once the organisation has real jobs or payments, and the owner can remove it.
 */
import { closeDay } from '../reconciliation/service';
import { withMigrator, withOrg } from '../persistence/pool';
import { ConflictError } from '../domain/errors';
import { logger } from '../common/logger';
import { generatePlan, DemoPlan } from './plan';
import { writePlan } from './seed';

const SAMPLE_SITE_KEY = 'westlands';

export async function hasSample(orgId: string): Promise<boolean> {
  return withOrg(orgId, async (client) => (await client.query('SELECT 1 FROM sites WHERE is_demo LIMIT 1')).rows.length > 0);
}

/** Only Westlands, minus the owner (the real owner already exists). */
export function samplePlan(now: Date, seed: number): DemoPlan {
  const full = generatePlan({ now, seed });
  const keep = (siteKey: string) => siteKey === SAMPLE_SITE_KEY;
  return {
    ...full,
    sites: full.sites.filter((site) => keep(site.key)),
    people: full.people.filter((person) => person.siteKey !== null && keep(person.siteKey)),
    jobs: full.jobs.filter((job) => keep(job.siteKey)),
    ghosts: full.ghosts.filter((item) => keep(item.siteKey)),
    orphans: full.orphans.filter((item) => keep(item.siteKey)),
    afterHours: full.afterHours.filter((item) => keep(item.siteKey))
  };
}

export interface SandboxSummary {
  sites: number;
  jobs: number;
  payments: number;
  flags: number;
  days: number;
}

export async function loadSample(orgId: string, now: Date = new Date()): Promise<SandboxSummary> {
  const guard = await withOrg(orgId, async (client) => {
    const sample = await client.query('SELECT 1 FROM sites WHERE is_demo LIMIT 1');
    const real = await client.query(
      `SELECT (SELECT count(*) FROM jobs j JOIN sites s ON s.id = j.site_id WHERE NOT s.is_demo)
            + (SELECT count(*) FROM payments p JOIN sites s ON s.id = p.site_id WHERE NOT s.is_demo) AS n`
    );
    return { hasSample: sample.rows.length > 0, realRecords: Number(real.rows[0].n) };
  });
  if (guard.hasSample) throw new ConflictError('Sample data is already loaded.');
  if (guard.realRecords > 0) throw new ConflictError('You already have real records, so sample data would be mixed in with them. It is only offered to a new account.');

  await withMigrator((client) => client.query('SELECT ensure_upcoming_partitions(3)'));

  // Seeded from the organisation id: the same account always gets the same sample world.
  const seed = parseInt(orgId.replace(/-/g, '').slice(0, 7), 16);
  const plan = samplePlan(now, seed);
  const { siteIds } = await withOrg(orgId, (client) => writePlan(client, orgId, plan, now, { sandbox: true }));

  let flags = 0;
  const siteId = siteIds[SAMPLE_SITE_KEY]!;
  for (const day of plan.days.slice(0, -1)) {
    flags += (await closeDay(orgId, siteId, day)).discrepanciesWritten;
  }
  logger.info('sample data loaded', { orgId, jobs: plan.jobs.length, flags });
  return {
    sites: 1,
    jobs: plan.jobs.length,
    payments: plan.jobs.filter((job) => job.payment).length + plan.orphans.length,
    flags,
    days: plan.days.length - 1
  };
}

const SAMPLE_TABLES_IN_DELETE_ORDER = [
  'telemetry', 'telemetry_minute', 'telemetry_hour', 'plate_captures', 'inventory_movements', 'payments',
  'discrepancies', 'day_closes'
];

/**
 * Removes the sample site and everything attached to it, and nothing else. job_events is append-only
 * for the application role by design (migration 0004), so removing a sample's events goes through the
 * migration connection, scoped to this one organisation and to sample sites by their flag.
 */
export async function removeSample(orgId: string): Promise<{ removed: boolean }> {
  if (!(await hasSample(orgId))) return { removed: false };

  await withMigrator(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('forecourt.org_id', $1, true)", [orgId]);
      await client.query('DELETE FROM job_events WHERE job_id IN (SELECT j.id FROM jobs j JOIN sites s ON s.id = j.site_id WHERE s.is_demo)');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });

  await withOrg(orgId, async (client) => {
    const siteIds = (await client.query('SELECT id FROM sites WHERE is_demo')).rows.map((row) => row.id as string);
    for (const table of SAMPLE_TABLES_IN_DELETE_ORDER) {
      await client.query(`DELETE FROM ${table} WHERE site_id = ANY($1::uuid[])`, [siteIds]);
    }
    await client.query('DELETE FROM job_services WHERE job_id IN (SELECT id FROM jobs WHERE site_id = ANY($1::uuid[]))', [siteIds]);
    await client.query('DELETE FROM jobs WHERE site_id = ANY($1::uuid[])', [siteIds]);
    await client.query('DELETE FROM vehicles WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.vehicle_id = vehicles.id)');
    await client.query('DELETE FROM devices WHERE site_id = ANY($1::uuid[])', [siteIds]);
    await client.query('DELETE FROM users WHERE is_demo');
    await client.query('DELETE FROM services WHERE is_demo');
    await client.query('DELETE FROM bays WHERE site_id = ANY($1::uuid[])', [siteIds]);
    await client.query('DELETE FROM sites WHERE is_demo');
  });
  logger.info('sample data removed', { orgId });
  return { removed: true };
}

