/** Pure-logic tests for the hardening pass: no database. */
import { describe, expect, it } from 'vitest';
import { cashAmountMismatch, deviceSilent, supplyPilferage } from '../src/reconciliation/rules';
import { consumablesPerWash } from '../src/reconciliation/baseline';
import { reconcile } from '../src/reconciliation/engine';
import { fromShillings, cents } from '../src/domain/money';
import { DeviceActivity, JobRecord, PaymentRecord, ReconciliationInput } from '../src/reconciliation/types';
import { cutoffs, partitionExpired } from '../src/persistence/maintenance';
import { compareMigrations } from '../src/persistence/readiness';
import { csvCell, csvLine, kes } from '../src/api/csv';
import { afterClause, decodeCursor, encodeCursor, finishPage, parseLimit, SortColumn } from '../src/persistence/paging';
import { createAccountCache, tokenIsCurrent, Account } from '../src/api/accounts';
import { canTransition } from '../src/domain/job';

const job = (overrides: Partial<JobRecord> = {}): JobRecord => ({
  id: `job-${Math.random().toString(36).slice(2, 8)}`,
  siteId: 's1',
  bayId: 'bay-1',
  workerId: 'w1',
  state: 'closed',
  quotedTotal: fromShillings(500),
  listTotal: fromShillings(500),
  createdAt: new Date('2026-10-14T08:00:00Z'),
  closedAt: new Date('2026-10-14T08:40:00Z'),
  serviceIds: ['basic'],
  discountAuthorisedBy: null,
  ...overrides
});

const payment = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: `pay-${Math.random().toString(36).slice(2, 8)}`,
  siteId: 's1',
  channel: 'cash',
  amount: fromShillings(500),
  externalRef: null,
  jobId: null,
  receivedAt: new Date('2026-10-14T08:45:00Z'),
  ...overrides
});

const base = (overrides: Partial<ReconciliationInput> = {}): ReconciliationInput => ({
  siteId: 's1',
  siteName: 'Test',
  day: new Date('2026-10-14T00:00:00Z'),
  timezone: 'Africa/Nairobi',
  operatingHours: { opensMinute: 360, closesMinute: 1140, daysOpen: [0, 1, 2, 3, 4, 5, 6] },
  baseline: { siteId: 's1', litresPerWash: 60, litresPerWashTolerance: 0.1, cashRatio: 0.1, discountRateByWorker: {}, consumablePerWash: {} },
  jobs: [],
  payments: [],
  telemetry: [],
  observations: [],
  consumables: [],
  ...overrides
});

describe('cash_amount_mismatch', () => {
  it('flags a cash payment that differs from the quote and nobody authorised', () => {
    const j = job();
    const found = cashAmountMismatch(base({ jobs: [j], payments: [payment({ jobId: j.id, amount: fromShillings(300) })] }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ type: 'cash_amount_mismatch', estimatedValue: fromShillings(200) });
  });

  it('flags an overpayment too, with no value, and ignores matching, authorised and non-cash payments', () => {
    const j = job();
    const over = cashAmountMismatch(base({ jobs: [j], payments: [payment({ jobId: j.id, amount: fromShillings(800) })] }));
    expect(over[0]!.estimatedValue).toBe(0);
    const clean = base({
      jobs: [j],
      payments: [
        payment({ jobId: j.id }),
        payment({ jobId: j.id, amount: fromShillings(100), varianceAuthorisedBy: 'supervisor-1' }),
        payment({ jobId: j.id, amount: fromShillings(100), channel: 'mpesa', externalRef: 'X' })
      ]
    });
    expect(cashAmountMismatch(clean)).toEqual([]);
  });

  it('is part of a normal reconcile', () => {
    const j = job();
    const result = reconcile(base({ jobs: [j], payments: [payment({ jobId: j.id, amount: fromShillings(300) })] }));
    expect(result.discrepancies.map((d) => d.type)).toContain('cash_amount_mismatch');
  });
});

describe('device_silent', () => {
  const device = (overrides: Partial<DeviceActivity> = {}): DeviceActivity => ({
    deviceId: 'dev-12345678',
    type: 'flow_meter',
    bayId: 'bay-1',
    registeredAt: new Date('2026-10-01T00:00:00Z'),
    readingMinutes: [],
    ...overrides
  });

  it('flags a meter that said nothing near any job, as high', () => {
    const found = deviceSilent(base({ jobs: [job(), job()], devices: [device()] }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ type: 'device_silent', severity: 'high' });
    expect(found[0]!.summary).toContain('dev-1234');
  });

  it('is medium when only some jobs went unwitnessed, and silent when the meter was heard near each job', () => {
    const morning = job({ createdAt: new Date('2026-10-14T08:00:00Z') });
    const evening = job({ createdAt: new Date('2026-10-14T17:00:00Z') });
    const heardMorning = device({ readingMinutes: [new Date('2026-10-14T08:10:00Z')] });
    expect(deviceSilent(base({ jobs: [morning, evening], devices: [heardMorning] }))[0]!.severity).toBe('medium');
    const heardBoth = device({ readingMinutes: [new Date('2026-10-14T08:10:00Z'), new Date('2026-10-14T17:05:00Z')] });
    expect(deviceSilent(base({ jobs: [morning, evening], devices: [heardBoth] }))).toEqual([]);
  });

  it('respects the configured window', () => {
    const j = job({ createdAt: new Date('2026-10-14T08:00:00Z') });
    const d = device({ readingMinutes: [new Date('2026-10-14T09:30:00Z')] });
    expect(deviceSilent(base({ jobs: [j], devices: [d] }))).toEqual([]); // 90 minutes away, window 120
    const tight = base({ jobs: [j], devices: [d] });
    tight.baseline.deviceSilentMinutes = 30;
    expect(deviceSilent(tight)).toHaveLength(1);
  });

  it('never blames a device for jobs before it was registered, a different bay, or non-measuring types', () => {
    const j = job({ createdAt: new Date('2026-10-14T08:00:00Z') });
    expect(deviceSilent(base({ jobs: [j], devices: [device({ registeredAt: new Date('2026-10-14T12:00:00Z') })] }))).toEqual([]);
    expect(deviceSilent(base({ jobs: [j], devices: [device({ bayId: 'bay-2' })] }))).toEqual([]);
    expect(deviceSilent(base({ jobs: [j], devices: [device({ type: 'camera' })] }))).toEqual([]);
    expect(deviceSilent(base({ jobs: [], devices: [device()] }))).toEqual([]);
  });
});

describe('supply_pilferage now has a baseline', () => {
  const perService = new Map<string, Record<string, number>>([
    ['basic', { detergent: 0.05 }],
    ['valet', { detergent: 0.1, wax: 0.02 }]
  ]);

  it('averages what the services sold say they draw, over counted washes only', () => {
    const jobs = [job({ serviceIds: ['basic'] }), job({ serviceIds: ['valet'] }), job({ serviceIds: ['basic', 'valet'] }), job({ state: 'abandoned', serviceIds: ['valet'] })];
    const perWash = consumablesPerWash(jobs, perService);
    expect(perWash.detergent).toBeCloseTo((0.05 + 0.1 + 0.15) / 3);
    expect(perWash.wax).toBeCloseTo((0.02 + 0.02) / 3);
    expect(consumablesPerWash([], perService)).toEqual({});
    expect(consumablesPerWash(jobs, new Map())).toEqual({});
  });

  it('fires once the baseline is loaded, and only for items someone configured', () => {
    const jobs = [job(), job(), job(), job()];
    const consumablePerWash = consumablesPerWash(jobs, perService);
    const draws = [
      { siteId: 's1', itemId: 'detergent', itemName: 'Detergent', quantity: 1.0, unit: 'L' },
      { siteId: 's1', itemId: 'mystery', itemName: 'Mystery', quantity: 50, unit: 'L' }
    ];
    const withBaseline = base({ jobs, consumables: draws });
    withBaseline.baseline.consumablePerWash = consumablePerWash;
    const found = supplyPilferage(withBaseline);
    expect(found).toHaveLength(1);
    expect(found[0]!.evidence).toMatchObject({ itemId: 'detergent' });

    // the old behaviour: an empty baseline never fires
    expect(supplyPilferage(base({ jobs, consumables: draws }))).toEqual([]);
  });
});

describe('retention maths', () => {
  const config = { minuteDays: 35, hourDays: 800, rawDays: 95, idempotencyDays: 3 };
  const now = new Date('2026-10-06T15:42:17Z');

  it('aligns the minute cutoff to a whole hour so no hour is rolled up half way', () => {
    const limits = cutoffs(now, config);
    expect(limits.minuteBefore.toISOString()).toBe('2026-09-01T15:00:00.000Z');
    expect(limits.idempotencyBefore.toISOString()).toBe('2026-10-03T15:42:17.000Z');
  });

  it('expires a monthly partition only when the whole month is older than the cutoff', () => {
    const raw = new Date('2026-07-03T00:00:00Z');
    expect(partitionExpired('telemetry_2026_06', raw)).toBe(true);
    expect(partitionExpired('telemetry_2026_07', raw)).toBe(false); // July ends after the cutoff
    expect(partitionExpired('telemetry_2026_08', raw)).toBe(false);
    expect(partitionExpired('telemetry_minute', raw)).toBe(false);
    expect(partitionExpired('job_events_2020_01', raw)).toBe(false); // the audit log is never expired
  });
});

describe('readiness', () => {
  it('reports pending migrations and tolerates a database that is ahead of the build', () => {
    expect(compareMigrations(['0001_a.sql', '0002_b.sql'], ['0001_a.sql'])).toEqual({ pending: ['0002_b.sql'], ahead: [] });
    expect(compareMigrations(['0001_a.sql'], ['0001_a.sql', '0002_b.sql'])).toEqual({ pending: [], ahead: ['0002_b.sql'] });
  });
});

describe('csv', () => {
  it('quotes what needs quoting and defuses spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+254700000000')).toBe("'+254700000000");
    expect(csvCell(-500)).toBe('-500');
    expect(csvCell(null)).toBe('');
    expect(csvLine(['a', 1, true])).toBe('a,1,true\r\n');
  });

  it('formats cents without floating point', () => {
    expect(kes(12345)).toBe('123.45');
    expect(kes(5)).toBe('0.05');
    expect(kes(-250)).toBe('-2.50');
    expect(kes(100_000_000)).toBe('1000000.00');
  });
});

describe('keyset paging', () => {
  const columns: SortColumn[] = [
    { sql: 'a', dir: 'desc', type: 'timestamptz' },
    { sql: 'b', dir: 'asc', type: 'int' },
    { sql: 'c', dir: 'desc', type: 'uuid' }
  ];

  it('expands mixed directions into an OR chain and keeps values as parameters', () => {
    const params: unknown[] = ['already-there'];
    const clause = afterClause(columns, ['2026-10-06 10:00:00.123456+00', '3', 'id-1'], params)!;
    expect(params).toEqual(['already-there', '2026-10-06 10:00:00.123456+00', '3', 'id-1']);
    expect(clause).toBe(
      '((a < $2::timestamptz) OR (a = $2::timestamptz AND b > $3::int) OR (a = $2::timestamptz AND b = $3::int AND c < $4::uuid))'
    );
    expect(afterClause(columns, null, [])).toBeNull();
  });

  it('round-trips a cursor and refuses a forged or mis-sized one', () => {
    const cursor = encodeCursor(['x', 'y']);
    expect(decodeCursor(cursor, 2)).toEqual(['x', 'y']);
    expect(() => decodeCursor(cursor, 3)).toThrow(/cursor/);
    expect(() => decodeCursor('not-base64-json!', 2)).toThrow(/cursor/);
    expect(decodeCursor(undefined, 2)).toBeNull();
  });

  it('cuts the extra row and only hands out a cursor when more exist', () => {
    const rows = [{ k0: 'a', id: 1 }, { k0: 'b', id: 2 }, { k0: 'c', id: 3 }];
    const one: SortColumn[] = [{ sql: 'x', dir: 'asc', type: 'text' }];
    const page = finishPage(rows, 2, one, (row) => row.id);
    expect(page.items).toEqual([1, 2]);
    expect(decodeCursor(page.next, 1)).toEqual(['b']);
    expect(finishPage(rows.slice(0, 2), 2, one, (row) => row.id).next).toBeNull();
  });

  it('bounds and validates limit', () => {
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit('500')).toBe(200);
    expect(() => parseLimit('0')).toThrow();
    expect(() => parseLimit('abc')).toThrow();
  });
});

describe('session cache', () => {
  const account: Account = { status: 'active', role: 'worker', siteId: null, tokenVersion: 0 };

  it('serves from cache within the ttl, reloads after it, and drops an invalidated entry at once', async () => {
    let clock = 0;
    let loads = 0;
    const cache = createAccountCache(async () => ({ ...account, tokenVersion: loads++ }), 10_000, () => clock);
    expect((await cache.get('o', 'u'))!.tokenVersion).toBe(0);
    clock = 9_999;
    expect((await cache.get('o', 'u'))!.tokenVersion).toBe(0);
    clock = 10_000;
    expect((await cache.get('o', 'u'))!.tokenVersion).toBe(1);
    cache.invalidate('o', 'u');
    expect((await cache.get('o', 'u'))!.tokenVersion).toBe(2);
    expect(loads).toBe(3);
  });

  it('does not cache at all when the ttl is zero', async () => {
    let loads = 0;
    const cache = createAccountCache(async () => (loads++, account), 0);
    await cache.get('o', 'u');
    await cache.get('o', 'u');
    expect(loads).toBe(2);
  });

  it('only honours a token whose version matches an active account', () => {
    expect(tokenIsCurrent(account, 0)).toBe(true);
    expect(tokenIsCurrent(account, undefined)).toBe(true); // tokens minted before versions existed carry none: version 0
    expect(tokenIsCurrent({ ...account, tokenVersion: 1 }, 0)).toBe(false);
    expect(tokenIsCurrent({ ...account, status: 'suspended' }, 0)).toBe(false);
    expect(tokenIsCurrent(null, 0)).toBe(false);
  });
});

describe('voided jobs', () => {
  it('can be reached from paid and closed only, and go nowhere', () => {
    expect(canTransition('paid', 'voided')).toBe(true);
    expect(canTransition('closed', 'voided')).toBe(true);
    expect(canTransition('awaiting_payment', 'voided')).toBe(false);
    expect(canTransition('voided', 'paid')).toBe(false);
    expect(cents(0)).toBe(0);
  });
});
