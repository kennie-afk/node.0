import { withOrg } from '../persistence/pool';
import {
  consumablesForDay,
  deviceActivityForDay,
  serviceConsumables,
  findSite,
  jobsForDay,
  observationsForDay,
  paymentsForDay,
  saveDiscrepancies,
  telemetryForDay
} from '../persistence/repositories';
import { NotFoundError } from '../domain/errors';
import { reconcile } from './engine';
import { consumablesPerWash } from './baseline';
import { DiscrepancyType, ReconciliationResult, Severity } from './types';
import { cents } from '../domain/money';
import { renderDailyReport } from '../reporting/daily-report';

export interface CloseOutcome {
  result: ReconciliationResult;
  report: string;
  discrepanciesWritten: number;
}

export async function closeDay(
  orgId: string,
  siteId: string,
  day: string
): Promise<CloseOutcome> {
  return withOrg(orgId, async (client) => {
    const site = await findSite(client, siteId);
    if (!site) {
      throw new NotFoundError(`Site ${siteId} was not found for this organisation`);
    }

    // One client runs one query at a time; issuing them together relied on pg queueing them
    // internally, which pg 9 removes.
    const jobs = await jobsForDay(client, siteId, day);
    const payments = await paymentsForDay(client, siteId, day);
    const telemetry = await telemetryForDay(client, siteId, day);
    const observations = await observationsForDay(client, siteId, day);
    const consumables = await consumablesForDay(client, siteId, day);
    const devices = await deviceActivityForDay(client, siteId, day);
    const perService = await serviceConsumables(client);

    const result = reconcile({
      siteId,
      siteName: site.name,
      day: new Date(`${day}T00:00:00Z`),
      timezone: site.timezone,
      operatingHours: {
        opensMinute: site.opensMinute,
        closesMinute: site.closesMinute,
        daysOpen: site.daysOpen
      },
      baseline: {
        siteId,
        litresPerWash: site.litresPerWash,
        litresPerWashTolerance: 0.1,
        cashRatio: site.cashRatio,
        discountRateByWorker: {},
        consumablePerWash: consumablesPerWash(jobs, perService)
      },
      jobs,
      payments,
      telemetry,
      observations,
      consumables,
      devices
    });

    const discrepanciesWritten = await saveDiscrepancies(
      client,
      orgId,
      siteId,
      day,
      result.discrepancies.map((item) => ({
        type: item.type,
        severity: item.severity,
        estimatedValue: item.estimatedValue,
        summary: item.summary,
        evidence: item.evidence
      }))
    );

    // Record that this day was checked, even if it was clean and wrote no flags.
    await client.query(
      `INSERT INTO day_closes (org_id, site_id, business_day, cars_detected, jobs_recorded, expected_cents, received_cents, gap_cents, flags, payments_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (site_id, business_day) DO UPDATE SET
         cars_detected = EXCLUDED.cars_detected, jobs_recorded = EXCLUDED.jobs_recorded,
         expected_cents = EXCLUDED.expected_cents, received_cents = EXCLUDED.received_cents,
         gap_cents = EXCLUDED.gap_cents, flags = EXCLUDED.flags, payments_count = EXCLUDED.payments_count, closed_at = now()`,
      [orgId, siteId, day, result.vehiclesDetected, result.jobsRecorded, result.expectedRevenue, result.receivedRevenue, result.gap, result.discrepancies.length, payments.length]
    );

    return { result, report: renderDailyReport(result), discrepanciesWritten };
  });
}

export interface StoredDay {
  siteName: string;
  day: string;
  vehiclesDetected: number;
  jobsRecorded: number;
  expectedCents: number;
  receivedCents: number;
  gapCents: number;
  closedAt: Date;
  summary: string;
  discrepancies: { type: string; severity: string; estimatedValue: number; summary: string }[];
}

/**
 * A day as it was last reconciled, read from day_closes and the flags it wrote, with no recomputation and
 * no write. Reading a report must never change anything (and must keep working for an organisation whose
 * subscription has lapsed); only POST /sites/close recomputes.
 */
export async function readStoredDay(orgId: string, siteId: string, day: string): Promise<StoredDay | null> {
  return withOrg(orgId, async (client) => {
    const { rows } = await client.query(
      `SELECT c.cars_detected, c.jobs_recorded, c.expected_cents, c.received_cents, c.gap_cents, c.closed_at, s.name AS site
         FROM day_closes c JOIN sites s ON s.id = c.site_id
        WHERE c.site_id = $1 AND c.business_day = $2`,
      [siteId, day]
    );
    const close = rows[0];
    if (!close) return null;
    const flags = await client.query(
      `SELECT type, severity, est_value_cents, summary FROM discrepancies
        WHERE site_id = $1 AND business_day = $2
        ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, est_value_cents DESC, id`,
      [siteId, day]
    );
    const discrepancies = flags.rows.map((row) => ({
      type: row.type as string,
      severity: row.severity as string,
      estimatedValue: Number(row.est_value_cents),
      summary: row.summary as string
    }));
    const summary = renderDailyReport({
      siteId,
      siteName: close.site,
      day: new Date(`${day}T00:00:00Z`),
      vehiclesDetected: close.cars_detected,
      jobsRecorded: close.jobs_recorded,
      expectedRevenue: cents(Number(close.expected_cents)),
      receivedRevenue: cents(Number(close.received_cents)),
      gap: cents(Number(close.gap_cents)),
      discrepancies: discrepancies.map((item) => ({ ...item, severity: item.severity as Severity, type: item.type as DiscrepancyType, estimatedValue: cents(item.estimatedValue), evidence: {} }))
    });
    return {
      siteName: close.site,
      day,
      vehiclesDetected: close.cars_detected,
      jobsRecorded: close.jobs_recorded,
      expectedCents: Number(close.expected_cents),
      receivedCents: Number(close.received_cents),
      gapCents: Number(close.gap_cents),
      closedAt: close.closed_at,
      summary,
      discrepancies
    };
  });
}

/**
 * After a record that a closed day was built on changes (a refund), the stored day is recomputed so the
 * figures and flags stop counting the reversed sale. Days nobody has reconciled yet are left alone: they
 * will be computed from the corrected records anyway.
 */
export async function recloseIfClosed(orgId: string, siteId: string, days: string[]): Promise<void> {
  for (const day of new Set(days)) {
    const closed = await withOrg(orgId, async (client) =>
      (await client.query('SELECT 1 FROM day_closes WHERE site_id = $1 AND business_day = $2', [siteId, day])).rows.length > 0
    );
    if (closed) await closeDay(orgId, siteId, day);
  }
}
