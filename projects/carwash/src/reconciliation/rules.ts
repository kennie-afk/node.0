import { Cents, addCents, cents, fromShillings, subtractCents } from '../domain/money';
import {
  ConsumableDraw,
  Discrepancy,
  JobRecord,
  OperatingHours,
  PaymentRecord,
  ReconciliationInput,
  SiteBaseline,
  TelemetryWindow,
  VehicleObservation
} from './types';

export type Rule = (input: ReconciliationInput) => Discrepancy[];

const PAID_STATES = new Set(['paid', 'closed']);
const COUNTED_STATES = new Set(['in_progress', 'awaiting_payment', 'paid', 'closed']);

function minuteOfDay(at: Date): number {
  return at.getUTCHours() * 60 + at.getUTCMinutes();
}

function withinOperatingHours(at: Date, hours: OperatingHours): boolean {
  if (!hours.daysOpen.includes(at.getUTCDay())) {
    return false;
  }
  const minute = minuteOfDay(at);
  return minute >= hours.opensMinute && minute < hours.closesMinute;
}

function totalLitres(telemetry: TelemetryWindow[]): number {
  return telemetry.reduce((sum, window) => sum + window.litres, 0);
}

function countedJobs(jobs: JobRecord[]): JobRecord[] {
  return jobs.filter((job) => COUNTED_STATES.has(job.state));
}

function averagePrice(jobs: JobRecord[]): Cents {
  const counted = countedJobs(jobs);
  if (counted.length === 0) {
    return cents(0);
  }
  return cents(
    Math.round(counted.reduce((sum, job) => sum + job.listTotal, 0) / counted.length)
  );
}

export const ghostWashFromWater: Rule = (input) => {
  const litres = totalLitres(input.telemetry);
  if (litres <= 0 || input.baseline.litresPerWash <= 0) {
    return [];
  }

  const impliedWashes = Math.floor(litres / input.baseline.litresPerWash);
  const recorded = countedJobs(input.jobs).length;
  const missing = impliedWashes - recorded;

  const tolerance = Math.max(1, Math.ceil(impliedWashes * input.baseline.litresPerWashTolerance));
  if (missing <= tolerance) {
    return [];
  }

  const estimated = cents(missing * averagePrice(input.jobs));

  return [
    {
      type: 'ghost_wash',
      severity: missing >= 5 ? 'critical' : missing >= 3 ? 'high' : 'medium',
      estimatedValue: estimated,
      summary: `Water use implies about ${impliedWashes} washes but only ${recorded} were recorded`,
      evidence: {
        litres,
        litresPerWash: input.baseline.litresPerWash,
        impliedWashes,
        recordedJobs: recorded,
        missing,
        tolerance
      }
    }
  ];
};

export const paymentWithoutJob: Rule = (input) => {
  const orphans = input.payments.filter(
    (payment) => payment.jobId === null && payment.channel !== 'cash'
  );
  if (orphans.length === 0) {
    return [];
  }

  return [
    {
      type: 'payment_without_job',
      severity: 'medium',
      estimatedValue: cents(0),
      summary: `${orphans.length} payment(s) arrived with no job attached`,
      evidence: {
        paymentIds: orphans.map((payment) => payment.id),
        total: addCents(...orphans.map((payment) => payment.amount))
      }
    }
  ];
};

export const jobWithoutPayment: Rule = (input) => {
  const paidJobIds = new Set(
    input.payments.filter((payment) => payment.jobId).map((payment) => payment.jobId as string)
  );

  const unpaid = input.jobs.filter(
    (job) => PAID_STATES.has(job.state) === false && job.state === 'awaiting_payment'
  );
  const closedUnpaid = input.jobs.filter(
    (job) => job.state === 'closed' && !paidJobIds.has(job.id)
  );

  const affected = [...unpaid, ...closedUnpaid];
  if (affected.length === 0) {
    return [];
  }

  return [
    {
      type: 'job_without_payment',
      severity: closedUnpaid.length > 0 ? 'high' : 'medium',
      estimatedValue: addCents(...affected.map((job) => job.quotedTotal)),
      summary: `${affected.length} job(s) have no matching payment`,
      evidence: { jobIds: affected.map((job) => job.id) }
    }
  ];
};

export const underquoting: Rule = (input) => {
  const undercharged = countedJobs(input.jobs).filter(
    (job) => job.quotedTotal < job.listTotal && job.discountAuthorisedBy === null
  );

  if (undercharged.length === 0) {
    return [];
  }

  const shortfall = addCents(
    ...undercharged.map((job) => subtractCents(job.listTotal, job.quotedTotal))
  );

  return [
    {
      type: 'underquoting',
      severity: shortfall > fromShillings(2000) ? 'high' : 'medium',
      estimatedValue: shortfall,
      summary: `${undercharged.length} job(s) charged below list price with no authorised discount`,
      evidence: {
        jobIds: undercharged.map((job) => job.id),
        shortfall
      }
    }
  ];
};

export const afterHoursOperation: Rule = (input) => {
  const outside = input.telemetry.filter(
    (window) =>
      window.litres > 0 && !withinOperatingHours(window.from, input.operatingHours)
  );

  if (outside.length === 0) {
    return [];
  }

  const litres = totalLitres(outside);
  const impliedWashes =
    input.baseline.litresPerWash > 0 ? Math.floor(litres / input.baseline.litresPerWash) : 0;

  return [
    {
      type: 'after_hours_operation',
      severity: 'high',
      estimatedValue: cents(impliedWashes * averagePrice(input.jobs)),
      summary: `Water ran outside opening hours across ${outside.length} window(s)`,
      evidence: {
        litres,
        impliedWashes,
        windows: outside.map((window) => ({
          bayId: window.bayId,
          from: window.from.toISOString(),
          to: window.to.toISOString(),
          litres: window.litres
        }))
      }
    }
  ];
};

export const supplyPilferage: Rule = (input) => {
  const washes = countedJobs(input.jobs).length;
  if (washes === 0) {
    return [];
  }

  const findings = input.consumables.flatMap((draw) => {
    const expectedPerWash = input.baseline.consumablePerWash[draw.itemId];
    if (expectedPerWash === undefined || expectedPerWash <= 0) {
      return [];
    }

    const expected = expectedPerWash * washes;
    const excess = draw.quantity - expected;
    if (excess <= expected * 0.25) {
      return [];
    }

    const finding: Discrepancy = {
      type: 'supply_pilferage',
      severity: excess > expected ? 'high' : 'medium',
      estimatedValue: cents(0),
      summary: `${draw.itemName} draw is ${Math.round((excess / expected) * 100)}% above the expected amount for ${washes} washes`,
      evidence: {
        itemId: draw.itemId,
        drawn: draw.quantity,
        expected,
        unit: draw.unit,
        washes
      }
    };

    return [finding];
  });

  return findings;
};

export const cashRatioSpike: Rule = (input) => {
  const total = input.payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (total === 0) {
    return [];
  }

  const cash = input.payments
    .filter((payment) => payment.channel === 'cash')
    .reduce((sum, payment) => sum + payment.amount, 0);

  const ratio = cash / total;
  const baseline = input.baseline.cashRatio;

  if (ratio <= baseline + 0.2) {
    return [];
  }

  return [
    {
      type: 'cash_ratio_spike',
      severity: ratio > baseline + 0.4 ? 'high' : 'medium',
      estimatedValue: cents(0),
      summary: `Cash was ${Math.round(ratio * 100)}% of takings against a baseline of ${Math.round(baseline * 100)}%`,
      evidence: { ratio, baseline, cash, total }
    }
  ];
};

export const abandonedJobPattern: Rule = (input) => {
  const byWorker = new Map<string, number>();
  for (const job of input.jobs) {
    if (job.state === 'abandoned') {
      byWorker.set(job.workerId, (byWorker.get(job.workerId) ?? 0) + 1);
    }
  }

  return [...byWorker.entries()]
    .filter(([, count]) => count >= 3)
    .map<Discrepancy>(([workerId, count]) => ({
      type: 'abandoned_job_pattern',
      severity: count >= 5 ? 'high' : 'medium',
      estimatedValue: cents(0),
      summary: `${count} jobs opened and abandoned by the same worker`,
      evidence: { workerId, count }
    }));
};

export const demandVersusWork: Rule = (input) => {
  const arrivals = input.observations.filter((item) => item.direction === 'entry').length;
  if (arrivals === 0) {
    return [];
  }

  const recorded = countedJobs(input.jobs).length;
  const missing = arrivals - recorded;

  if (missing <= Math.max(2, Math.ceil(arrivals * 0.15))) {
    return [];
  }

  return [
    {
      type: 'ghost_wash',
      severity: missing >= 8 ? 'critical' : 'high',
      estimatedValue: cents(missing * averagePrice(input.jobs)),
      summary: `${arrivals} vehicles arrived but only ${recorded} jobs were recorded`,
      evidence: { arrivals, recordedJobs: recorded, missing }
    }
  ];
};

export const ALL_RULES: Rule[] = [
  ghostWashFromWater,
  demandVersusWork,
  paymentWithoutJob,
  jobWithoutPayment,
  underquoting,
  afterHoursOperation,
  supplyPilferage,
  cashRatioSpike,
  abandonedJobPattern
];
