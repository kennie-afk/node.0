import { Cents, addCents, cents, subtractCents } from '../domain/money';
import { ALL_RULES, Rule } from './rules';
import { Discrepancy, ReconciliationInput, ReconciliationResult, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

const COUNTED_STATES = new Set(['in_progress', 'awaiting_payment', 'paid', 'closed']);

export function expectedRevenue(input: ReconciliationInput): Cents {
  const counted = input.jobs.filter((job) => COUNTED_STATES.has(job.state));
  if (counted.length === 0) {
    return cents(0);
  }
  return addCents(...counted.map((job) => job.listTotal));
}

export function receivedRevenue(input: ReconciliationInput): Cents {
  if (input.payments.length === 0) {
    return cents(0);
  }
  return addCents(...input.payments.map((payment) => payment.amount));
}

export function reconcile(
  input: ReconciliationInput,
  rules: Rule[] = ALL_RULES
): ReconciliationResult {
  const discrepancies: Discrepancy[] = [];

  for (const rule of rules) {
    try {
      discrepancies.push(...rule(input));
    } catch (error) {
      discrepancies.push({
        type: 'device_silent',
        severity: 'low',
        estimatedValue: cents(0),
        summary: 'A reconciliation rule could not run against this day',
        evidence: {
          rule: rule.name,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  discrepancies.sort((left, right) => {
    const bySeverity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    return bySeverity !== 0 ? bySeverity : right.estimatedValue - left.estimatedValue;
  });

  const expected = expectedRevenue(input);
  const received = receivedRevenue(input);

  return {
    siteId: input.siteId,
    siteName: input.siteName,
    day: input.day,
    vehiclesDetected: input.observations.filter((item) => item.direction === 'entry').length,
    jobsRecorded: input.jobs.filter((job) => COUNTED_STATES.has(job.state)).length,
    expectedRevenue: expected,
    receivedRevenue: received,
    gap: subtractCents(expected, received),
    discrepancies
  };
}
