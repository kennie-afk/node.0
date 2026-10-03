import { withOrg } from '../persistence/pool';
import {
  consumablesForDay,
  findSite,
  jobsForDay,
  observationsForDay,
  paymentsForDay,
  saveDiscrepancies,
  telemetryForDay
} from '../persistence/repositories';
import { NotFoundError } from '../domain/errors';
import { reconcile } from './engine';
import { ReconciliationResult } from './types';
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
        consumablePerWash: {}
      },
      jobs,
      payments,
      telemetry,
      observations,
      consumables
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
      `INSERT INTO day_closes (org_id, site_id, business_day, cars_detected, jobs_recorded, expected_cents, received_cents, gap_cents, flags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (site_id, business_day) DO UPDATE SET
         cars_detected = EXCLUDED.cars_detected, jobs_recorded = EXCLUDED.jobs_recorded,
         expected_cents = EXCLUDED.expected_cents, received_cents = EXCLUDED.received_cents,
         gap_cents = EXCLUDED.gap_cents, flags = EXCLUDED.flags, closed_at = now()`,
      [orgId, siteId, day, result.vehiclesDetected, result.jobsRecorded, result.expectedRevenue, result.receivedRevenue, result.gap, result.discrepancies.length]
    );

    return { result, report: renderDailyReport(result), discrepanciesWritten };
  });
}
