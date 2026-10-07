import { countedJobs } from './rules';
import { JobRecord } from './types';

/**
 * The consumables one wash is expected to draw, averaged over the day's washes from what each service
 * sold says it uses (services.consumables). The supply_pilferage rule multiplies this by the number of
 * washes, so a day of mostly full valets expects more detergent than a day of basic washes.
 *
 * A service that lists no consumables contributes nothing; an item no service lists gets no baseline and
 * is therefore never flagged (we do not guess at an amount nobody configured).
 */
export function consumablesPerWash(
  jobs: JobRecord[],
  perService: ReadonlyMap<string, Record<string, number>>
): Record<string, number> {
  const washes = countedJobs(jobs);
  if (washes.length === 0) return {};

  const totals: Record<string, number> = {};
  for (const job of washes) {
    for (const serviceId of job.serviceIds) {
      for (const [item, quantity] of Object.entries(perService.get(serviceId) ?? {})) {
        totals[item] = (totals[item] ?? 0) + quantity;
      }
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([item, total]) => [item, total / washes.length]));
}
