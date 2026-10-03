/**
 * Loads the demo world (see plan.ts) into Postgres through the application's own restricted role
 * and its own org-scoping path, so row-level security authorises every write exactly as it does
 * in production. Then runs the real reconciliation engine over each past day, so every flag in
 * the console was produced by the product rather than typed in.
 *
 *   FORECOURT_ALLOW_DEMO_SEED=true npm run demo:seed            (idempotent)
 *   FORECOURT_ALLOW_DEMO_SEED=true npm run demo:seed -- --reset (wipe the demo org and rebuild)
 *
 * Refuses to run without FORECOURT_ALLOW_DEMO_SEED=true: the accounts it creates all share one
 * published PIN and must never exist in a real deployment.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { PoolClient } from 'pg';
import { closeMigrationPool, closePool, withMigrator, withOrg, withoutTenant } from '../persistence/pool';
import { closeDay } from '../reconciliation/service';
import { storeReadings } from '../ingestion/repository';
import { Reading } from '../ingestion/batch';
import { normalisePlate } from '../domain/plate';
import { DEMO_OWNER_PHONE, DEMO_ORG_NAME, DEMO_PIN, DemoPlan, demoSecret, dayKey, generatePlan } from './plan';

export function assertDemoAllowed(): void {
  if (process.env.FORECOURT_ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'refusing to seed demo data: set FORECOURT_ALLOW_DEMO_SEED=true. The demo accounts share a published PIN and must never exist in a real deployment.'
    );
  }
}

async function existingDemoOrg(): Promise<string | null> {
  return withoutTenant(async (client) => {
    const { rows } = await client.query('SELECT org_id FROM resolve_login($1)', [DEMO_OWNER_PHONE]);
    return rows[0]?.org_id ?? null;
  });
}

const TABLES_IN_DELETE_ORDER = [
  'telemetry', 'telemetry_minute', 'telemetry_hour', 'plate_captures', 'inventory_movements', 'payments',
  'job_services', 'job_events', 'jobs', 'vehicles', 'discrepancies', 'devices', 'users', 'services', 'bays', 'sites'
];

async function wipe(orgId: string): Promise<void> {
  // job_events is append-only for the application role (migration 0004 revokes UPDATE and DELETE),
  // which is the point of it. Resetting a demo is an owner's operation, so it goes through the
  // migration connection, scoped to the one organisation.
  await withMigrator(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('forecourt.org_id', $1, true)", [orgId]);
      await client.query('DELETE FROM job_events WHERE org_id = $1', [orgId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  await withOrg(orgId, async (client) => {
    for (const table of TABLES_IN_DELETE_ORDER) {
      if (table === 'job_events') continue;
      const scoped = table === 'job_services' ? 'DELETE FROM job_services WHERE job_id IN (SELECT id FROM jobs)' : `DELETE FROM ${table}`;
      await client.query(scoped);
    }
    await client.query('DELETE FROM organisations WHERE id = $1', [orgId]);
  });
}

export interface SeedSummary {
  orgId: string;
  siteIds: Record<string, string>;
  jobs: number;
  payments: number;
  flags: number;
  reused: boolean;
}

function jitterPlate(plate: string, seed: number): string {
  // A camera sometimes reads O for 0; the matcher is built to survive it.
  return seed % 17 === 0 ? plate.replace('0', 'O') : plate;
}

export interface WriteOptions {
  /**
   * Sample data inside a REAL organisation (see sandbox.ts): no organisation row, no published PIN,
   * no device secret anyone could know, no phone number a person could sign in with, no till number,
   * and every row flagged is_demo so it can be told apart from the owner's own records and removed.
   */
  sandbox?: boolean;
}

export async function writePlan(client: PoolClient, orgId: string, plan: DemoPlan, now: Date, options: WriteOptions = {}) {
  const sandbox = options.sandbox === true;
  const label = (name: string) => (sandbox ? `${name} (sample)` : name);
  const pinHash = await bcrypt.hash(sandbox ? randomUUID() : DEMO_PIN, 10);
  if (!sandbox) {
    await client.query('INSERT INTO organisations (id, name, billing_plan) VALUES ($1, $2, $3)', [orgId, DEMO_ORG_NAME, 'growth']);
  }

  const siteIds: Record<string, string> = {};
  const bayIds = new Map<string, string>();
  for (const site of plan.sites) {
    const { rows } = await client.query(
      `INSERT INTO sites (org_id, name, timezone, till_number, opens_minute, closes_minute, litres_per_wash, cash_ratio, is_demo)
       VALUES ($1, $2, 'Africa/Nairobi', $3, 360, 1140, $4, $5, $6) RETURNING id`,
      [orgId, label(site.name), sandbox ? null : site.till, site.litresPerWash, site.cashRatio, sandbox]
    );
    siteIds[site.key] = rows[0].id;
    for (const bay of site.bays) {
      const inserted = await client.query('INSERT INTO bays (org_id, site_id, label) VALUES ($1,$2,$3) RETURNING id', [orgId, rows[0].id, bay]);
      bayIds.set(`${site.key}|${bay}`, inserted.rows[0].id);
    }
  }

  const serviceIds = new Map<string, string>();
  for (const service of plan.services) {
    const { rows } = await client.query(
      `INSERT INTO services (org_id, name, list_price_cents, expected_water_l, expected_duration_s, commission_rate, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [orgId, label(service.name), service.listPriceCents, service.expectedWaterL, service.expectedDurationS, service.commissionRate, sandbox]
    );
    serviceIds.set(service.key, rows[0].id);
  }

  const personIds = new Map<string, string>();
  let sampleSerial = 0;
  for (const person of plan.people) {
    sampleSerial += 1;
    // A sample person has no real phone number and a disabled account: nobody can sign in as them.
    const { rows } = await client.query(
      `INSERT INTO users (org_id, site_id, role, display_name, phone, pin_hash, status, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        orgId,
        person.siteKey ? siteIds[person.siteKey] : null,
        person.role,
        label(person.displayName),
        sandbox ? `sample-${orgId.slice(0, 8)}-${sampleSerial}` : person.phone,
        pinHash,
        sandbox ? 'disabled' : 'active',
        sandbox
      ]
    );
    personIds.set(person.key, rows[0].id);
  }

  // Devices: one flow meter per bay and one plate camera per site. Their secrets are derived from
  // fixed strings so the simulator can authenticate as them; real secrets are never like this.
  const devices: Array<{ id: string; siteKey: string; bay: string | null; type: string; secretHash: string }> = [];
  for (const site of plan.sites) {
    for (const bay of site.bays) {
      const hash = await bcrypt.hash(sandbox ? randomUUID() : demoSecret(site.key, bay, 'flow_meter'), 10);
      const { rows } = await client.query(
        `INSERT INTO devices (org_id, site_id, bay_id, type, firmware, secret_hash) VALUES ($1,$2,$3,'flow_meter','fm-2.4.1',$4) RETURNING id`,
        [orgId, siteIds[site.key], bayIds.get(`${site.key}|${bay}`), hash]
      );
      devices.push({ id: rows[0].id, siteKey: site.key, bay, type: 'flow_meter', secretHash: hash });
    }
    const cameraHash = await bcrypt.hash(sandbox ? randomUUID() : demoSecret(site.key, 'gate', 'camera'), 10);
    const camera = await client.query(
      `INSERT INTO devices (org_id, site_id, type, firmware, secret_hash) VALUES ($1,$2,'camera','cam-1.9.0',$3) RETURNING id`,
      [orgId, siteIds[site.key], cameraHash]
    );
    devices.push({ id: camera.rows[0].id, siteKey: site.key, bay: null, type: 'camera', secretHash: cameraHash });
    if (site.silentBay) {
      // A pump monitor that stopped reporting three days ago.
      const hash = await bcrypt.hash(sandbox ? randomUUID() : demoSecret(site.key, site.silentBay, 'pump_monitor'), 10);
      await client.query(
        `INSERT INTO devices (org_id, site_id, bay_id, type, firmware, secret_hash, last_seen, last_sequence)
         VALUES ($1,$2,$3,'pump_monitor','pm-1.2.0',$4, $5, 4120)`,
        [orgId, siteIds[site.key], bayIds.get(`${site.key}|${site.silentBay}`), hash, new Date(now.getTime() - 3 * 86_400_000)]
      );
    }
  }

  // Vehicles
  const vehicles = new Map<string, { raw: string; first: Date; visits: number }>();
  for (const job of plan.jobs) {
    const key = normalisePlate(job.plate);
    const seen = vehicles.get(key);
    vehicles.set(key, { raw: job.plate, first: seen && seen.first < job.createdAt ? seen.first : job.createdAt, visits: (seen?.visits ?? 0) + 1 });
  }
  const vehicleIds = new Map<string, string>();
  for (const [plate, info] of vehicles) {
    const { rows } = await client.query(
      'INSERT INTO vehicles (org_id, plate_raw, plate_normalised, first_seen, visit_count) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [orgId, info.raw, plate, info.first, info.visits]
    );
    vehicleIds.set(plate, rows[0].id);
  }

  // Jobs, their lines, their events, their payments
  const jobRows: Array<{ id: string; job: DemoPlan['jobs'][number] }> = [];
  for (const job of plan.jobs) {
    const id = randomUUID();
    jobRows.push({ id, job });
    await client.query(
      `INSERT INTO jobs (id, org_id, site_id, bay_id, vehicle_id, worker_id, state, quoted_total_cents, list_total_cents, discount_authorised_by, created_at, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, orgId, siteIds[job.siteKey], bayIds.get(`${job.siteKey}|${job.bay}`), vehicleIds.get(normalisePlate(job.plate)), personIds.get(job.workerKey), job.state, job.quotedCents, job.listCents, job.authorisedByKey ? personIds.get(job.authorisedByKey) : null, job.createdAt, job.closedAt]
    );
    for (const key of job.serviceKeys) {
      const service = plan.services.find((s) => s.key === key)!;
      await client.query('INSERT INTO job_services (job_id, service_id, unit_price_cents) VALUES ($1,$2,$3)', [id, serviceIds.get(key), service.listPriceCents]);
    }
  }

  const events = { job: [] as string[], type: [] as string[], actor: [] as (string | null)[], at: [] as Date[], payload: [] as string[] };
  const pushEvent = (jobId: string, type: string, actor: string | undefined, at: Date, payload: object = {}) => {
    events.job.push(jobId);
    events.type.push(type);
    events.actor.push(actor ?? null);
    events.at.push(at);
    events.payload.push(JSON.stringify(payload));
  };

  const pay = { site: [] as string[], job: [] as string[], channel: [] as string[], amount: [] as number[], ref: [] as (string | null)[], msisdn: [] as (string | null)[], at: [] as Date[] };
  for (const { id, job } of jobRows) {
    const actor = personIds.get(job.workerKey);
    pushEvent(id, 'job.created', actor, job.createdAt, { listCents: job.listCents, quotedCents: job.quotedCents });
    if (job.state === 'abandoned') {
      pushEvent(id, 'job.abandoned', actor, job.closedAt ?? job.createdAt, { reason: 'customer left' });
      continue;
    }
    pushEvent(id, 'job.started', actor, job.startedAt);
    if (job.state === 'in_progress') continue;
    pushEvent(id, 'job.work_finished', actor, job.finishedAt);
    if (job.payment) {
      pushEvent(id, 'job.payment_matched', undefined, job.payment.at, { channel: job.payment.channel, amountCents: job.payment.amountCents });
      pay.site.push(siteIds[job.siteKey]!);
      pay.job.push(id);
      pay.channel.push(job.payment.channel);
      pay.amount.push(job.payment.amountCents);
      pay.ref.push(job.payment.ref);
      pay.msisdn.push(job.payment.msisdn);
      pay.at.push(job.payment.at);
    }
    if (job.state === 'closed' && job.closedAt) pushEvent(id, 'job.closed', actor, job.closedAt);
  }
  for (const orphan of plan.orphans) {
    pay.site.push(siteIds[orphan.siteKey]!);
    pay.job.push('');
    pay.channel.push('mpesa');
    pay.amount.push(orphan.amountCents);
    pay.ref.push(orphan.ref);
    pay.msisdn.push(orphan.msisdn);
    pay.at.push(orphan.at);
  }

  await client.query(
    `INSERT INTO job_events (org_id, job_id, type, actor_id, payload, server_ts, client_ts)
     SELECT $1, e.job, e.type, e.actor, e.payload::jsonb, e.at, e.at
       FROM UNNEST($2::uuid[], $3::text[], $4::uuid[], $5::text[], $6::timestamptz[]) AS e(job, type, actor, payload, at)`,
    [orgId, events.job, events.type, events.actor, events.payload, events.at]
  );
  await client.query(
    `INSERT INTO payments (org_id, site_id, job_id, channel, amount_cents, external_ref, payer_msisdn, received_at)
     SELECT $1, p.site, NULLIF(p.job, '')::uuid, p.channel, p.amount, p.ref, p.msisdn, p.at
       FROM UNNEST($2::uuid[], $3::text[], $4::text[], $5::bigint[], $6::text[], $7::text[], $8::timestamptz[]) AS p(site, job, channel, amount, ref, msisdn, at)`,
    [orgId, pay.site, pay.job, pay.channel, pay.amount, pay.ref, pay.msisdn, pay.at]
  );

  // Plate captures: the demand ledger
  const plates = { site: [] as string[], at: [] as Date[], raw: [] as string[], norm: [] as string[], conf: [] as number[], dir: [] as string[] };
  const capture = (siteKey: string, at: Date, plate: string, direction: 'entry' | 'exit', n: number) => {
    const raw = jitterPlate(plate, n);
    plates.site.push(siteIds[siteKey]!);
    plates.at.push(at);
    plates.raw.push(raw);
    plates.norm.push(normalisePlate(raw));
    plates.conf.push(Math.round((0.86 + ((n * 7) % 13) / 100) * 1000) / 1000);
    plates.dir.push(direction);
  };
  jobRows.forEach(({ job }, index) => {
    if (job.state === 'abandoned') return;
    capture(job.siteKey, new Date(job.createdAt.getTime() - 3 * 60_000), job.plate, 'entry', index);
    if (job.state === 'closed') capture(job.siteKey, new Date(job.finishedAt.getTime() + 4 * 60_000), job.plate, 'exit', index + 1);
  });
  plan.ghosts.forEach((ghost, index) => {
    capture(ghost.siteKey, ghost.at, ghost.plate, 'entry', index + 500);
    capture(ghost.siteKey, new Date(ghost.at.getTime() + ghost.minutes * 60_000), ghost.plate, 'exit', index + 501);
  });
  await client.query(
    `INSERT INTO plate_captures (org_id, site_id, ts, plate_raw, plate_normalised, confidence, direction)
     SELECT $1, c.site, c.at, c.raw, c.norm, c.conf, c.dir
       FROM UNNEST($2::uuid[], $3::timestamptz[], $4::text[], $5::text[], $6::numeric[], $7::text[]) AS c(site, at, raw, norm, conf, dir)`,
    [orgId, plates.site, plates.at, plates.raw, plates.norm, plates.conf, plates.dir]
  );

  // Telemetry: the work ledger, through the same storage path live devices use.
  const flowMeters = new Map(devices.filter((d) => d.type === 'flow_meter').map((d) => [`${d.siteKey}|${d.bay}`, d]));
  const perDevice = new Map<string, Map<string, { ts: Date; metric: Reading['metric']; value: number }>>();
  const addWater = (siteKey: string, bay: string, start: Date, minutes: number, litres: number) => {
    const device = flowMeters.get(`${siteKey}|${bay}`);
    if (!device || litres <= 0) return;
    const bucket = perDevice.get(device.id) ?? new Map();
    perDevice.set(device.id, bucket);
    const steps = Math.max(1, minutes);
    for (let m = 0; m < steps; m += 1) {
      const ts = new Date(start.getTime() + m * 60_000);
      for (const [metric, value] of [['water_litres', Math.round((litres / steps) * 100) / 100], ['pump_seconds', 46]] as const) {
        if (metric === 'pump_seconds' && litres <= 0) continue;
        const key = `${ts.toISOString()}|${metric}`;
        const existing = bucket.get(key);
        bucket.set(key, { ts, metric, value: (existing?.value ?? 0) + value });
      }
    }
  };
  for (const { job } of jobRows) {
    if (job.litres > 0) addWater(job.siteKey, job.bay, job.startedAt, Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 60_000), job.litres);
  }
  for (const ghost of plan.ghosts) addWater(ghost.siteKey, ghost.bay, ghost.at, ghost.minutes, ghost.litres);
  for (const late of plan.afterHours) addWater(late.siteKey, late.bay, late.at, late.minutes, late.litres);

  for (const device of devices.filter((d) => d.type === 'flow_meter')) {
    const bucket = perDevice.get(device.id);
    if (!bucket) continue;
    const readings: Reading[] = [...bucket.values()]
      .sort((a, b) => a.ts.getTime() - b.ts.getTime())
      .map((item, index) => ({ sequence: index + 1, ts: item.ts.toISOString(), metric: item.metric, value: item.value }));
    const identity = { id: device.id, orgId, siteId: siteIds[device.siteKey]!, bayId: bayIds.get(`${device.siteKey}|${device.bay}`) ?? null, secretHash: device.secretHash, lastSequence: 0 };
    for (let from = 0; from < readings.length; from += 2000) {
      const slice = readings.slice(from, from + 2000);
      await storeReadings(client, identity, { deviceId: device.id, firmware: 'fm-2.4.1', readings: slice }, slice);
      identity.lastSequence = slice[slice.length - 1]!.sequence;
    }
  }

  await client.query("UPDATE devices SET last_seen = now() WHERE type = 'camera' AND site_id = ANY($1::uuid[])", [Object.values(siteIds)]);

  // Consumables: a shampoo and a wax draw per site per day, and a weekly restock.
  for (const site of plan.sites) {
    const manager = personIds.get(`${site.key}-m`);
    for (const day of plan.days.slice(0, -1)) {
      const washes = plan.jobs.filter((job) => job.siteKey === site.key && dayKey(job.createdAt) === day && job.state === 'closed').length;
      const at = new Date(`${day}T15:00:00Z`);
      await client.query(
        `INSERT INTO inventory_movements (org_id, site_id, item_id, item_name, delta, unit, reason, actor_id, ts)
         VALUES ($1,$2,'shampoo','Car shampoo',$3,'L','daily use',$4,$5), ($1,$2,'wax','Liquid wax',$6,'L','daily use',$4,$5)`,
        [orgId, siteIds[site.key], -(washes * 0.04).toFixed(3), manager, at, -(washes * 0.012).toFixed(3)]
      );
    }
    await client.query(
      `INSERT INTO inventory_movements (org_id, site_id, item_id, item_name, delta, unit, reason, actor_id, ts)
       VALUES ($1,$2,'shampoo','Car shampoo',40,'L','restock',$3,$4)`,
      [orgId, siteIds[site.key], manager, new Date(now.getTime() - 7 * 86_400_000)]
    );
  }

  return { siteIds, personIds };
}

export async function seedDemo(options: { reset?: boolean; now?: Date } = {}): Promise<SeedSummary> {
  assertDemoAllowed();
  const now = options.now ?? new Date();

  await withMigrator((client) => client.query('SELECT ensure_upcoming_partitions(3)'));

  const existing = await existingDemoOrg();
  if (existing && !options.reset) {
    const flags = await withOrg(existing, async (client) => Number((await client.query('SELECT count(*) AS n FROM discrepancies')).rows[0].n));
    return { orgId: existing, siteIds: {}, jobs: 0, payments: 0, flags, reused: true };
  }
  if (existing) {
    await wipe(existing);
  }

  const plan = generatePlan({ now });
  const orgId = randomUUID();
  const { siteIds, personIds } = await withOrg(orgId, (client) => writePlan(client, orgId, plan, now));

  // The real engine, over each trading day that has finished.
  let flags = 0;
  for (const site of plan.sites) {
    for (const day of plan.days.slice(0, -1)) {
      const outcome = await closeDay(orgId, siteIds[site.key]!, day);
      flags += outcome.discrepanciesWritten;
    }
  }

  // Leave the queue in a believable mixed state: some resolved, most still open.
  await withOrg(orgId, async (client) => {
    const manager = (siteKey: string) => personIds.get(`${siteKey}-m`);
    const resolutions: Array<[string, string, string, string]> = [
      ['abandoned_job_pattern', 'explained', 'kilimani', 'Hassan says those were customers who left when they saw the queue. Retrained on logging an abandon reason.'],
      ['cash_ratio_spike', 'confirmed', 'thika', 'Attendant kept cash sales off the mobile till for the day. Recovered KSh 6,400 and issued a written warning.'],
      ['payment_without_job', 'dismissed', 'westlands', 'Customer paid for a friend\'s wash at another bay; receipt reattached by the manager.']
    ];
    for (const [type, state, siteKey, note] of resolutions) {
      await client.query(
        `UPDATE discrepancies SET state = $1, resolved_by = $2, resolution_note = $3
          WHERE id = (SELECT id FROM discrepancies WHERE type = $4 AND site_id = $5 AND state = 'open' ORDER BY business_day LIMIT 1)`,
        [state, manager(siteKey), note, type, siteIds[siteKey]]
      );
    }
  });

  return { orgId, siteIds, jobs: plan.jobs.length, payments: plan.jobs.filter((j) => j.payment).length + plan.orphans.length, flags, reused: false };
}

export function printSummary(summary: SeedSummary): void {
  const line = '-'.repeat(64);
  console.log(`\n${line}`);
  console.log(summary.reused ? '  Demo data already present (use --reset to rebuild)' : `  Demo data loaded: ${summary.jobs} jobs, ${summary.payments} payments, ${summary.flags} flags raised`);
  console.log(line);
  console.log('  DEMO ACCOUNTS (development only - every account shares this PIN)');
  console.log(`    PIN: ${DEMO_PIN}`);
  console.log('    owner        254700000001  Amina Wanjiru   (all sites)');
  console.log('    manager      254700000002  Brian Otieno    (Westlands)');
  console.log('    manager      254700000003  Grace Njeri     (Kilimani)');
  console.log('    manager      254700000004  Peter Kamau     (Thika Road)');
  console.log('    worker       254700000011  Samuel Kiptoo   (Westlands)');
  console.log(`${line}\n`);
}

if (process.argv[1]?.includes('demo/seed')) {
  seedDemo({ reset: process.argv.includes('--reset') })
    .then(printSummary)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePool().catch(() => undefined);
      await closeMigrationPool().catch(() => undefined);
    });
}
