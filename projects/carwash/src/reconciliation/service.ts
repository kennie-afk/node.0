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

    const [jobs, payments, telemetry, observations, consumables] = await Promise.all([
      jobsForDay(client, siteId, day),
      paymentsForDay(client, siteId, day),
      telemetryForDay(client, siteId, day),
      observationsForDay(client, siteId, day),
      consumablesForDay(client, siteId, day)
    ]);

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

    return { result, report: renderDailyReport(result), discrepanciesWritten };
  });
}
