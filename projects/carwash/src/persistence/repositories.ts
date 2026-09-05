import { PoolClient } from 'pg';
import { Cents, cents } from '../domain/money';
import { JobState } from '../domain/job';
import {
  ConsumableDraw,
  JobRecord,
  PaymentRecord,
  TelemetryWindow,
  VehicleObservation
} from '../reconciliation/types';

export interface SiteRow {
  id: string;
  orgId: string;
  name: string;
  timezone: string;
  opensMinute: number;
  closesMinute: number;
  daysOpen: number[];
  litresPerWash: number;
  cashRatio: number;
}

export async function findSite(client: PoolClient, siteId: string): Promise<SiteRow | null> {
  const { rows } = await client.query(
    `SELECT id, org_id, name, timezone, opens_minute, closes_minute, days_open,
            litres_per_wash, cash_ratio
       FROM sites WHERE id = $1`,
    [siteId]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    timezone: row.timezone,
    opensMinute: row.opens_minute,
    closesMinute: row.closes_minute,
    daysOpen: row.days_open,
    litresPerWash: Number(row.litres_per_wash),
    cashRatio: Number(row.cash_ratio)
  };
}

export async function jobsForDay(
  client: PoolClient,
  siteId: string,
  day: string
): Promise<JobRecord[]> {
  const { rows } = await client.query(
    `SELECT j.id, j.site_id, j.bay_id, j.worker_id, j.state,
            j.quoted_total_cents, j.list_total_cents, j.created_at, j.closed_at,
            j.discount_authorised_by,
            COALESCE(array_agg(js.service_id) FILTER (WHERE js.service_id IS NOT NULL), '{}') AS service_ids
       FROM jobs j
       LEFT JOIN job_services js ON js.job_id = j.id
      WHERE j.site_id = $1 AND j.created_at >= $2::date AND j.created_at < $2::date + 1
      GROUP BY j.id`,
    [siteId, day]
  );

  return rows.map((row) => ({
    id: row.id,
    siteId: row.site_id,
    bayId: row.bay_id,
    workerId: row.worker_id,
    state: row.state,
    quotedTotal: cents(Number(row.quoted_total_cents)),
    listTotal: cents(Number(row.list_total_cents)),
    createdAt: row.created_at,
    closedAt: row.closed_at,
    serviceIds: row.service_ids,
    discountAuthorisedBy: row.discount_authorised_by
  }));
}

export async function paymentsForDay(
  client: PoolClient,
  siteId: string,
  day: string
): Promise<PaymentRecord[]> {
  const { rows } = await client.query(
    `SELECT id, site_id, channel, amount_cents, external_ref, job_id, received_at
       FROM payments
      WHERE site_id = $1 AND received_at >= $2::date AND received_at < $2::date + 1`,
    [siteId, day]
  );

  return rows.map((row) => ({
    id: row.id,
    siteId: row.site_id,
    channel: row.channel,
    amount: cents(Number(row.amount_cents)),
    externalRef: row.external_ref,
    jobId: row.job_id,
    receivedAt: row.received_at
  }));
}

export async function telemetryForDay(
  client: PoolClient,
  siteId: string,
  day: string
): Promise<TelemetryWindow[]> {
  const { rows } = await client.query(
    `SELECT bay_id,
            date_trunc('hour', bucket) AS from_ts,
            SUM(total) FILTER (WHERE metric = 'water_litres')   AS litres,
            SUM(total) FILTER (WHERE metric = 'pump_seconds')   AS pump_seconds,
            SUM(total) FILTER (WHERE metric = 'machine_cycles') AS cycles
       FROM telemetry_minute
      WHERE site_id = $1 AND bucket >= $2::date AND bucket < $2::date + 1
      GROUP BY bay_id, date_trunc('hour', bucket)
      ORDER BY from_ts`,
    [siteId, day]
  );

  return rows.map((row) => ({
    siteId,
    bayId: row.bay_id ?? 'unknown',
    from: row.from_ts,
    to: new Date(new Date(row.from_ts).getTime() + 3_600_000),
    litres: Number(row.litres ?? 0),
    pumpRuntimeSeconds: Number(row.pump_seconds ?? 0),
    machineCycles: Number(row.cycles ?? 0)
  }));
}

export async function observationsForDay(
  client: PoolClient,
  siteId: string,
  day: string
): Promise<VehicleObservation[]> {
  const { rows } = await client.query(
    `SELECT ts, plate_normalised, direction
       FROM plate_captures
      WHERE site_id = $1 AND ts >= $2::date AND ts < $2::date + 1`,
    [siteId, day]
  );

  return rows.map((row) => ({
    siteId,
    observedAt: row.ts,
    plateNormalised: row.plate_normalised,
    direction: row.direction
  }));
}

export async function consumablesForDay(
  client: PoolClient,
  siteId: string,
  day: string
): Promise<ConsumableDraw[]> {
  const { rows } = await client.query(
    `SELECT item_id, item_name, unit, SUM(-delta) AS drawn
       FROM inventory_movements
      WHERE site_id = $1 AND ts >= $2::date AND ts < $2::date + 1 AND delta < 0
      GROUP BY item_id, item_name, unit`,
    [siteId, day]
  );

  return rows.map((row) => ({
    siteId,
    itemId: row.item_id,
    itemName: row.item_name,
    quantity: Number(row.drawn),
    unit: row.unit
  }));
}

export async function openJobsForMatching(client: PoolClient, siteId: string) {
  const { rows } = await client.query(
    `SELECT j.id, j.quoted_total_cents, j.created_at, j.state, v.plate_normalised
       FROM jobs j
       LEFT JOIN vehicles v ON v.id = j.vehicle_id
      WHERE j.site_id = $1 AND j.state IN ('in_progress','awaiting_payment')`,
    [siteId]
  );

  return rows.map((row) => ({
    jobId: row.id,
    quotedTotalCents: Number(row.quoted_total_cents),
    plateNormalised: row.plate_normalised,
    createdAt: row.created_at,
    state: row.state
  }));
}

export async function recordJobEvent(
  client: PoolClient,
  input: {
    orgId: string;
    jobId: string;
    type: string;
    actorId: string | null;
    payload: Record<string, unknown>;
    clientTs: Date | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO job_events (org_id, job_id, type, actor_id, payload, client_ts)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.orgId, input.jobId, input.type, input.actorId, input.payload, input.clientTs]
  );
}

export async function transitionJob(
  client: PoolClient,
  jobId: string,
  state: JobState,
  closedAt: Date | null = null
): Promise<void> {
  await client.query(
    `UPDATE jobs SET state = $2, closed_at = COALESCE($3, closed_at) WHERE id = $1`,
    [jobId, state, closedAt]
  );
}

export async function insertPayment(
  client: PoolClient,
  input: {
    orgId: string;
    siteId: string;
    jobId: string | null;
    channel: string;
    amountCents: Cents;
    externalRef: string | null;
    payerMsisdn: string | null;
    receivedAt: Date;
  }
): Promise<{ id: string; created: boolean }> {
  const { rows } = await client.query(
    `INSERT INTO payments (org_id, site_id, job_id, channel, amount_cents, external_ref, payer_msisdn, received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (channel, external_ref) DO NOTHING
     RETURNING id`,
    [
      input.orgId,
      input.siteId,
      input.jobId,
      input.channel,
      input.amountCents,
      input.externalRef,
      input.payerMsisdn,
      input.receivedAt
    ]
  );

  if (rows[0]) {
    return { id: rows[0].id, created: true };
  }

  const existing = await client.query(
    `SELECT id FROM payments WHERE channel = $1 AND external_ref = $2`,
    [input.channel, input.externalRef]
  );
  return { id: existing.rows[0]?.id ?? '', created: false };
}

export async function saveDiscrepancies(
  client: PoolClient,
  orgId: string,
  siteId: string,
  day: string,
  items: { type: string; severity: string; estimatedValue: number; summary: string; evidence: unknown }[]
): Promise<number> {
  let written = 0;
  for (const item of items) {
    const { rowCount } = await client.query(
      `INSERT INTO discrepancies (org_id, site_id, business_day, type, severity, est_value_cents, summary, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (org_id, site_id, business_day, type, summary) DO NOTHING`,
      [orgId, siteId, day, item.type, item.severity, item.estimatedValue, item.summary, item.evidence]
    );
    written += rowCount ?? 0;
  }
  return written;
}
