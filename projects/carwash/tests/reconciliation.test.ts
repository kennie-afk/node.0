import { describe, expect, it } from 'vitest';
import { reconcile } from '../src/reconciliation/engine';
import { fromShillings } from '../src/domain/money';
import { renderDailyReport } from '../src/reporting/daily-report';
import {
  JobRecord,
  PaymentRecord,
  ReconciliationInput,
  TelemetryWindow
} from '../src/reconciliation/types';

const DAY = new Date('2026-10-14T00:00:00Z');

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: `job-${Math.random().toString(36).slice(2, 8)}`,
    siteId: 'site-1',
    bayId: 'bay-1',
    workerId: 'worker-1',
    state: 'closed',
    quotedTotal: fromShillings(550),
    listTotal: fromShillings(550),
    createdAt: new Date('2026-10-14T08:00:00Z'),
    closedAt: new Date('2026-10-14T08:40:00Z'),
    serviceIds: ['svc-basic'],
    discountAuthorisedBy: null,
    ...overrides
  };
}

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: `pay-${Math.random().toString(36).slice(2, 8)}`,
    siteId: 'site-1',
    channel: 'mpesa',
    amount: fromShillings(550),
    externalRef: 'ABC123',
    jobId: null,
    receivedAt: new Date('2026-10-14T08:45:00Z'),
    ...overrides
  };
}

function window(litres: number, from: string, bayId = 'bay-1'): TelemetryWindow {
  return {
    siteId: 'site-1',
    bayId,
    from: new Date(from),
    to: new Date(new Date(from).getTime() + 60 * 60 * 1000),
    litres,
    pumpRuntimeSeconds: Math.round(litres * 2),
    machineCycles: 0
  };
}

function input(overrides: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    siteId: 'site-1',
    siteName: 'Kilimani Bay',
    day: DAY,
    timezone: 'Africa/Nairobi',
    operatingHours: { opensMinute: 6 * 60, closesMinute: 19 * 60, daysOpen: [0, 1, 2, 3, 4, 5, 6] },
    baseline: {
      siteId: 'site-1',
      litresPerWash: 60,
      litresPerWashTolerance: 0.1,
      cashRatio: 0.1,
      discountRateByWorker: {},
      consumablePerWash: { shampoo: 0.05 }
    },
    jobs: [],
    payments: [],
    telemetry: [],
    observations: [],
    consumables: [],
    ...overrides
  };
}

function typesFound(result: { discrepancies: { type: string }[] }): string[] {
  return result.discrepancies.map((item) => item.type);
}

describe('a clean day raises nothing', () => {
  it('reports no discrepancies when work, water and money agree', () => {
    const jobs = [job(), job(), job()];
    const result = reconcile(
      input({
        jobs,
        payments: jobs.map((item) => payment({ jobId: item.id })),
        telemetry: [window(180, '2026-10-14T08:00:00Z')]
      })
    );

    expect(result.discrepancies).toHaveLength(0);
    expect(result.gap).toBe(0);
  });
});

describe('fraud 1: ghost washes', () => {
  it('catches water used far beyond the jobs recorded', () => {
    const result = reconcile(
      input({
        jobs: [job()],
        payments: [payment()],
        telemetry: [window(600, '2026-10-14T08:00:00Z')]
      })
    );

    expect(typesFound(result)).toContain('ghost_wash');
    const ghost = result.discrepancies.find((item) => item.type === 'ghost_wash');
    expect(ghost?.evidence).toMatchObject({ impliedWashes: 10, recordedJobs: 1 });
    expect(ghost?.estimatedValue).toBeGreaterThan(0);
  });

  it('catches vehicles arriving that never became jobs', () => {
    const result = reconcile(
      input({
        jobs: [job(), job()],
        observations: Array.from({ length: 12 }, () => ({
          siteId: 'site-1',
          observedAt: new Date('2026-10-14T09:00:00Z'),
          plateNormalised: 'KDA123A',
          direction: 'entry' as const
        }))
      })
    );

    expect(typesFound(result)).toContain('ghost_wash');
  });

  it('tolerates a small difference rather than crying wolf', () => {
    const result = reconcile(
      input({
        jobs: [job(), job(), job()],
        telemetry: [window(200, '2026-10-14T08:00:00Z')]
      })
    );

    expect(typesFound(result)).not.toContain('ghost_wash');
  });
});

describe('fraud 2: underquoting', () => {
  it('flags a job charged below list with no authorised discount', () => {
    const result = reconcile(
      input({
        jobs: [job({ quotedTotal: fromShillings(300), listTotal: fromShillings(500) })]
      })
    );

    const finding = result.discrepancies.find((item) => item.type === 'underquoting');
    expect(finding?.estimatedValue).toBe(fromShillings(200));
  });

  it('accepts a discount that a manager authorised', () => {
    const result = reconcile(
      input({
        jobs: [
          job({
            quotedTotal: fromShillings(300),
            listTotal: fromShillings(500),
            discountAuthorisedBy: 'manager-1'
          })
        ]
      })
    );

    expect(typesFound(result)).not.toContain('underquoting');
  });
});

describe('fraud 4: supply pilferage', () => {
  it('flags consumable draw well above the per-wash norm', () => {
    const result = reconcile(
      input({
        jobs: [job(), job()],
        consumables: [
          { siteId: 'site-1', itemId: 'shampoo', itemName: 'Shampoo', quantity: 1.2, unit: 'L' }
        ]
      })
    );

    expect(typesFound(result)).toContain('supply_pilferage');
  });
});

describe('fraud 5: after-hours operation', () => {
  it('flags water running before opening time', () => {
    const result = reconcile(
      input({
        jobs: [job()],
        telemetry: [window(120, '2026-10-14T03:00:00Z')]
      })
    );

    expect(typesFound(result)).toContain('after_hours_operation');
  });
});

describe('money that does not line up', () => {
  it('flags a payment with no job attached', () => {
    const result = reconcile(input({ payments: [payment({ jobId: null })] }));
    expect(typesFound(result)).toContain('payment_without_job');
  });

  it('flags a closed job with no payment', () => {
    const result = reconcile(input({ jobs: [job({ state: 'closed' })], payments: [] }));
    expect(typesFound(result)).toContain('job_without_payment');
  });

  it('flags cash rising well above the site baseline', () => {
    const result = reconcile(
      input({
        jobs: [job(), job()],
        payments: [
          payment({ channel: 'cash', jobId: 'a' }),
          payment({ channel: 'cash', jobId: 'b' })
        ]
      })
    );

    expect(typesFound(result)).toContain('cash_ratio_spike');
  });
});

describe('worker behaviour patterns', () => {
  it('flags repeated abandonment by one worker', () => {
    const result = reconcile(
      input({
        jobs: [
          job({ state: 'abandoned', workerId: 'worker-9' }),
          job({ state: 'abandoned', workerId: 'worker-9' }),
          job({ state: 'abandoned', workerId: 'worker-9' })
        ]
      })
    );

    expect(typesFound(result)).toContain('abandoned_job_pattern');
  });
});

describe('the engine survives a broken rule', () => {
  it('records the failure instead of losing the whole day', () => {
    const exploding = () => {
      throw new Error('bad rule');
    };
    const result = reconcile(input(), [exploding as never]);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]?.evidence).toMatchObject({ error: 'bad rule' });
  });
});

describe('the daily report is the product', () => {
  it('renders the owner message', () => {
    const jobs = Array.from({ length: 34 }, () => job({ listTotal: fromShillings(550) }));
    const result = reconcile(
      input({
        jobs,
        payments: Array.from({ length: 27 }, () => payment({ jobId: 'x' })),
        observations: Array.from({ length: 41 }, () => ({
          siteId: 'site-1',
          observedAt: new Date('2026-10-14T09:00:00Z'),
          plateNormalised: null,
          direction: 'entry' as const
        }))
      })
    );

    const report = renderDailyReport(result);

    expect(report).toContain('KILIMANI BAY');
    expect(report).toContain('Cars detected:     41');
    expect(report).toContain('Jobs recorded:     34');
    expect(report).toContain('⚠');
  });
});
