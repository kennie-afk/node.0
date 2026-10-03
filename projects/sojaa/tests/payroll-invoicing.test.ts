import { describe, expect, it } from 'vitest';
import { applyDeductions, ILLUSTRATIVE, progressiveTax, validateConfig, PayeConfig, TableState } from '../src/payroll/deductions';
import { computePayslip, daysEmployed, daysInMonth, GuardPay, PaySettings, weekdayOf } from '../src/payroll/compute';
import { AGEING, ageingBucket, allocateCost, allocatePayment, buildInvoice, pickRate, Rate, shiftAmount } from '../src/invoicing/compute';

const settings: PaySettings = { minWageCents: 3_000_000, allowancesCountTowardMin: false, standardMonthlyHours: 225, overtimeMultiplierBp: 15000, restDayMultiplierBp: 20000, holidayMultiplierBp: 20000 };
const guard = (over: Partial<GuardPay> = {}): GuardPay => ({ id: 'g1', monthlyBasicCents: 3_000_000, allowanceCents: 0, restWeekday: null, hiredOn: '2025-01-01', exitedOn: null, nationalId: '12345678', nssfNo: 'N1', shaNo: 'S1', kraPin: 'A1', psraRegNo: 'P1', psraExpiry: null, ...over });
const confirmed = (): TableState[] => (['nssf', 'sha', 'housing', 'paye'] as const).map((kind) => ({ kind, status: 'confirmed' as const, source: 'illustrative_unverified' as const, config: ILLUSTRATIVE[kind] }));
const unconfirmed = (): TableState[] => (['nssf', 'sha', 'housing', 'paye'] as const).map((kind) => ({ kind, status: 'unconfirmed' as const, source: 'none' as const, config: {} }));
const run = (over: Partial<Parameters<typeof computePayslip>[0]> = {}) => computePayslip({ guard: guard(), month: '2026-10', settings, holidays: new Set(), shifts: [], adjustmentsCents: 0, tables: unconfirmed(), ...over });

describe('calendar helpers', () => {
  it('days in month, including leap February', () => {
    expect(daysInMonth('2026-10')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-04')).toBe(30);
  });
  it('days employed: full, hired mid-month, exited mid-month, both, none', () => {
    expect(daysEmployed('2026-10', '2025-01-01', null)).toBe(31);
    expect(daysEmployed('2026-10', '2026-10-16', null)).toBe(16);
    expect(daysEmployed('2026-10', '2025-01-01', '2026-10-10')).toBe(10);
    expect(daysEmployed('2026-10', '2026-10-05', '2026-10-05')).toBe(1);
    expect(daysEmployed('2026-10', '2026-11-01', null)).toBe(0);
    expect(daysEmployed('2026-10', '2025-01-01', '2026-09-30')).toBe(0);
  });
  it('weekday numbering is Sunday = 0', () => {
    expect(weekdayOf('2026-10-04')).toBe(0);
    expect(weekdayOf('2026-10-05')).toBe(1);
    expect(weekdayOf('2026-10-10')).toBe(6);
  });
});

describe('deduction tables', () => {
  it('unconfirmed or not applicable tables deduct nothing and say so', () => {
    const lines = applyDeductions(3_000_000, unconfirmed());
    expect(lines.every((l) => l.employeeCents === 0 && l.employerCents === 0 && !l.applied)).toBe(true);
    const na = applyDeductions(3_000_000, [{ kind: 'nssf', status: 'not_applicable', source: 'none', config: {} }]);
    expect(na.find((l) => l.kind === 'nssf')!.applied).toBe(false);
  });
  it('computes each line from the confirmed table (illustrative figures)', () => {
    const lines = Object.fromEntries(applyDeductions(3_000_000, confirmed()).map((l) => [l.kind, l]));
    expect(lines.nssf).toMatchObject({ employeeCents: 180_000, employerCents: 180_000, applied: true });
    expect(lines.sha!.employeeCents).toBe(82_500);
    expect(lines.housing).toMatchObject({ employeeCents: 45_000, employerCents: 45_000 });
    // taxable = 3,000,000 - 180,000 - 45,000 = 2,775,000: 10% of 2,400,000 + 25% of 375,000 = 333,750, less relief 240,000
    expect(lines.paye!.employeeCents).toBe(93_750);
  });
  it('caps NSSF at the upper limit', () => {
    const l = applyDeductions(20_000_000, confirmed()).find((x) => x.kind === 'nssf')!;
    expect(l.employeeCents).toBe(432_000);
  });
  it('applies the SHA minimum and an optional maximum', () => {
    const t = (config: unknown): TableState[] => [{ kind: 'sha', status: 'confirmed', source: 'firm_entered', config }];
    expect(applyDeductions(500_000, t({ employeeRateBp: 275, employerRateBp: 0, minCents: 30_000, maxCents: null }))[1]!.employeeCents).toBe(30_000);
    expect(applyDeductions(50_000_000, t({ employeeRateBp: 275, employerRateBp: 0, minCents: 30_000, maxCents: 100_000 }))[1]!.employeeCents).toBe(100_000);
  });
  it('tax is never negative after relief', () => {
    expect(progressiveTax(500_000, ILLUSTRATIVE.paye as PayeConfig)).toBe(0);
    expect(progressiveTax(0, ILLUSTRATIVE.paye as PayeConfig)).toBe(0);
  });
  it('walks the bands', () => {
    const c = { bands: [{ upToCents: 100_000, rateBp: 1000 }, { upToCents: null, rateBp: 2000 }], personalReliefCents: 0, taxableDeducts: [] } as PayeConfig;
    expect(progressiveTax(250_000, c)).toBe(10_000 + 30_000);
  });
  it('PAYE with no taxable deductions taxes gross', () => {
    const t: TableState[] = [{ kind: 'paye', status: 'confirmed', source: 'firm_entered', config: { bands: [{ upToCents: null, rateBp: 1000 }], personalReliefCents: 0, taxableDeducts: [] } }];
    expect(applyDeductions(1_000_000, t).find((l) => l.kind === 'paye')!.employeeCents).toBe(100_000);
  });
  it('validates configs: rates in range, bands ascending, last band open', () => {
    expect(() => validateConfig('nssf', { employeeRateBp: 20_000, employerRateBp: 0, upperLimitCents: null })).toThrow();
    expect(() => validateConfig('paye', { bands: [{ upToCents: 100, rateBp: 10 }, { upToCents: 50, rateBp: 20 }, { upToCents: null, rateBp: 30 }], personalReliefCents: 0, taxableDeducts: [] })).toThrow(/increase/);
    expect(() => validateConfig('paye', { bands: [{ upToCents: 100, rateBp: 10 }], personalReliefCents: 0, taxableDeducts: [] })).toThrow(/last band/);
    expect(() => validateConfig('paye', { bands: [{ upToCents: null, rateBp: 10 }, { upToCents: null, rateBp: 20 }], personalReliefCents: 0, taxableDeducts: [] })).toThrow();
    expect(validateConfig('housing', { employeeRateBp: 150, employerRateBp: 150 })).toEqual({ employeeRateBp: 150, employerRateBp: 150 });
    expect(() => validateConfig('sha', { employeeRateBp: 1 })).toThrow();
  });
  it('every illustrative table is itself valid', () => {
    for (const kind of ['nssf', 'sha', 'housing', 'paye'] as const) expect(() => validateConfig(kind, ILLUSTRATIVE[kind])).not.toThrow();
  });
});

describe('payslip', () => {
  it('a full month at the minimum is not below it', () => {
    const p = run();
    expect(p).toMatchObject({ basicCents: 3_000_000, grossCents: 3_000_000, belowMinimum: false, minRequiredCents: 3_000_000, netCents: 3_000_000 });
  });
  it('one cent below the minimum is flagged', () => {
    const p = run({ guard: guard({ monthlyBasicCents: 2_999_999 }) });
    expect(p.belowMinimum).toBe(true);
    expect(p.flags.some((f) => f.code === 'below_minimum' && f.severity === 'block')).toBe(true);
  });
  it('the minimum is prorated for a part month, so a fair part-month wage is not flagged', () => {
    const p = run({ guard: guard({ hiredOn: '2026-10-16' }) });
    expect(p.daysEmployed).toBe(16);
    expect(p.basicCents).toBe(1_548_387);
    expect(p.minRequiredCents).toBe(1_548_387);
    expect(p.belowMinimum).toBe(false);
  });
  it('a KES 6,000 guard (the figure in the research) is flagged however many hours they work', () => {
    const shifts = Array.from({ length: 26 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, workedMinutes: 720, scheduledMinutes: 720, overtimeApprovedMinutes: 0 }));
    expect(run({ guard: guard({ monthlyBasicCents: 600_000 }), shifts }).belowMinimum).toBe(true);
  });
  it('allowances count toward the minimum only when the firm says so', () => {
    const g = guard({ monthlyBasicCents: 2_500_000, allowanceCents: 600_000 });
    expect(run({ guard: g }).belowMinimum).toBe(true);
    expect(run({ guard: g, settings: { ...settings, allowancesCountTowardMin: true } }).belowMinimum).toBe(false);
  });
  it('overtime never counts toward the minimum', () => {
    const shifts = [{ day: '2026-10-07', workedMinutes: 900, scheduledMinutes: 720, overtimeApprovedMinutes: 180 }];
    const p = run({ guard: guard({ monthlyBasicCents: 2_000_000 }), shifts });
    expect(p.overtimeCents).toBeGreaterThan(0);
    expect(p.belowMinimum).toBe(true);
  });
  it('overtime pays approved minutes only, and not more than were worked beyond the shift', () => {
    // hourly = 3,000,000 / 225 = 13,333.33; 2h x 1.5 = 3 hourly units = 40,000
    expect(run({ shifts: [{ day: '2026-10-07', workedMinutes: 840, scheduledMinutes: 720, overtimeApprovedMinutes: 120 }] }).overtimeCents).toBe(40_000);
    expect(run({ shifts: [{ day: '2026-10-07', workedMinutes: 840, scheduledMinutes: 720, overtimeApprovedMinutes: 0 }] }).overtimeCents).toBe(0);
    expect(run({ shifts: [{ day: '2026-10-07', workedMinutes: 750, scheduledMinutes: 720, overtimeApprovedMinutes: 120 }] }).breakdown.overtimeMinutes).toBe(30);
    expect(run({ shifts: [{ day: '2026-10-07', workedMinutes: 700, scheduledMinutes: 720, overtimeApprovedMinutes: 120 }] }).overtimeCents).toBe(0);
  });
  it('a holiday shift earns the firm-set multiplier on top, and a normal day earns none', () => {
    const shift = [{ day: '2026-10-20', workedMinutes: 720, scheduledMinutes: 720, overtimeApprovedMinutes: 0 }];
    expect(run({ shifts: shift, holidays: new Set(['2026-10-20']) }).premiumCents).toBe(320_000);
    expect(run({ shifts: shift }).premiumCents).toBe(0);
  });
  it('a rest-day shift uses the rest-day multiplier; a holiday on a rest day pays once, as a holiday', () => {
    const sunday = [{ day: '2026-10-04', workedMinutes: 360, scheduledMinutes: 360, overtimeApprovedMinutes: 0 }];
    expect(run({ guard: guard({ restWeekday: 0 }), shifts: sunday }).premiumCents).toBe(160_000);
    expect(run({ guard: guard({ restWeekday: 0 }), shifts: sunday, settings: { ...settings, holidayMultiplierBp: 30000 } , holidays: new Set(['2026-10-04']) }).premiumCents).toBe(240_000);
    expect(run({ guard: guard({ restWeekday: 3 }), shifts: sunday }).premiumCents).toBe(0);
  });
  it('adjustments flow into gross and can be negative', () => {
    expect(run({ adjustmentsCents: 50_000 }).grossCents).toBe(3_050_000);
    expect(run({ adjustmentsCents: -50_000 }).grossCents).toBe(2_950_000);
  });
  it('net = gross - employee deductions; employer cost adds employer contributions', () => {
    const p = run({ tables: confirmed() });
    expect(p.employeeDeductionsCents).toBe(180_000 + 82_500 + 45_000 + 93_750);
    expect(p.netCents).toBe(3_000_000 - p.employeeDeductionsCents);
    expect(p.employerCostCents).toBe(3_000_000 + 180_000 + 45_000);
  });
  it('flags missing identifiers, skipping a number the firm marked not applicable', () => {
    const bare = guard({ nationalId: null, nssfNo: null, shaNo: null, kraPin: null, psraRegNo: null });
    const codes = run({ guard: bare }).flags.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['missing_national_id', 'missing_nssf_no', 'missing_sha_no', 'missing_kra_pin', 'missing_psra_reg']));
    const na = unconfirmed().map((t) => (t.kind === 'nssf' ? { ...t, status: 'not_applicable' as const } : t));
    expect(run({ guard: bare, tables: na }).flags.map((f) => f.code)).not.toContain('missing_nssf_no');
  });
  it('flags an expired PSRA number as the firm typed it', () => {
    expect(run({ guard: guard({ psraExpiry: '2026-09-30' }) }).flags.map((f) => f.code)).toContain('psra_expired');
    expect(run({ guard: guard({ psraExpiry: '2026-12-31' }) }).flags.map((f) => f.code)).not.toContain('psra_expired');
  });
  it('a guard not employed this month gets a zero payslip with no minimum owed', () => {
    const p = run({ guard: guard({ hiredOn: '2026-11-01' }) });
    expect(p).toMatchObject({ daysEmployed: 0, basicCents: 0, minRequiredCents: 0, belowMinimum: false });
  });
  it('flags a negative net', () => {
    const p = run({ guard: guard({ monthlyBasicCents: 100_000 }), adjustmentsCents: -200_000, tables: confirmed() });
    expect(p.flags.map((f) => f.code)).toContain('negative_net');
  });
  it('pays whole cents', () => {
    const p = run({ guard: guard({ monthlyBasicCents: 3_333_333, hiredOn: '2026-10-11' }) });
    expect(Number.isInteger(p.basicCents) && Number.isInteger(p.grossCents) && Number.isInteger(p.netCents)).toBe(true);
  });
});

describe('invoicing', () => {
  const rate = (over: Partial<Rate> = {}): Rate => ({ id: 'r1', siteId: 's1', postId: null, basis: 'per_shift', amountCents: 150_000, effectiveFrom: '2026-01-01', seq: 1, ...over });
  it('picks the latest effective rate not after the shift day', () => {
    const rs = [rate({ id: 'a', effectiveFrom: '2026-01-01', amountCents: 100 }), rate({ id: 'b', effectiveFrom: '2026-09-01', amountCents: 200, seq: 2 }), rate({ id: 'c', effectiveFrom: '2026-11-01', amountCents: 300, seq: 3 })];
    expect(pickRate(rs, 's1', 'p1', '2026-10-05')!.id).toBe('b');
    expect(pickRate(rs, 's1', 'p1', '2025-12-31')).toBeNull();
  });
  it('a post rate beats a site rate, and a newer entry beats an older one on the same date', () => {
    const rs = [rate({ id: 'site', amountCents: 1 }), rate({ id: 'post', postId: 'p1', amountCents: 2, effectiveFrom: '2026-01-01' }), rate({ id: 'post2', postId: 'p1', amountCents: 3, effectiveFrom: '2026-01-01', seq: 9 })];
    expect(pickRate(rs, 's1', 'p1', '2026-10-05')!.id).toBe('post2');
    expect(pickRate(rs, 's1', 'p2', '2026-10-05')!.id).toBe('site');
    expect(pickRate(rs, 'other', 'p1', '2026-10-05')).toBeNull();
  });
  it('per hour bills verified minutes', () => {
    expect(shiftAmount(rate({ basis: 'per_hour', amountCents: 20_000 }), 90)).toBe(30_000);
    expect(shiftAmount(rate({ basis: 'per_shift' }), 1)).toBe(150_000);
  });
  const shifts = (n: number, minutes = 720) => Array.from({ length: n }, (_, i) => ({ shiftId: `sh${i}`, siteId: 's1', siteName: 'Gate A', postId: 'p1', postName: 'Night', day: `2026-10-${String(i + 1).padStart(2, '0')}`, verifiedMinutes: minutes }));
  it('bills verified shifts and reports the rest, never billing a missed shift', () => {
    const list = [...shifts(3), { ...shifts(1)[0]!, shiftId: 'missed', verifiedMinutes: 0 }];
    const inv = buildInvoice(list, [rate()]);
    expect(inv.total).toBe(450_000);
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]!.quantity).toBe(3);
    expect(inv.unbillable).toEqual([{ shiftId: 'missed', reason: 'not_verified' }]);
  });
  it('a shift with no rate is reported, not guessed', () => {
    const inv = buildInvoice(shifts(2), []);
    expect(inv.total).toBe(0);
    expect(inv.unbillable.map((u) => u.reason)).toEqual(['no_rate', 'no_rate']);
  });
  it('line totals tie out to the shifts they bill, per hour', () => {
    const inv = buildInvoice(shifts(3, 500), [rate({ basis: 'per_hour', amountCents: 17_777 })]);
    const perShift = Math.round((17_777 * 500) / 60);
    expect(inv.lines[0]!.amountCents).toBe(perShift * 3);
    expect(inv.lines[0]!.shifts.reduce((s, x) => s + x.billedCents, 0)).toBe(inv.total);
    expect(inv.lines[0]!.quantity).toBe(25);
  });
  it('a rate change mid-month makes two lines', () => {
    const inv = buildInvoice(shifts(4), [rate({ amountCents: 100_000 }), rate({ id: 'r2', amountCents: 120_000, effectiveFrom: '2026-10-03', seq: 2 })]);
    expect(inv.lines).toHaveLength(2);
    expect(inv.total).toBe(2 * 100_000 + 2 * 120_000);
  });
  it('allocates a payment to the oldest invoice first and keeps the excess on account', () => {
    const a = allocatePayment(250_000, [{ id: 'i1', balanceCents: 100_000 }, { id: 'i2', balanceCents: 100_000 }, { id: 'i3', balanceCents: 100_000 }]);
    expect(a.allocations).toEqual([{ invoiceId: 'i1', amountCents: 100_000 }, { invoiceId: 'i2', amountCents: 100_000 }, { invoiceId: 'i3', amountCents: 50_000 }]);
    expect(a.unallocatedCents).toBe(0);
    expect(allocatePayment(500_000, [{ id: 'i1', balanceCents: 100_000 }]).unallocatedCents).toBe(400_000);
    expect(allocatePayment(100, []).unallocatedCents).toBe(100);
    expect(allocatePayment(100, [{ id: 'z', balanceCents: 0 }]).allocations).toEqual([]);
  });
  it('ageing buckets by days past the due date', () => {
    expect(ageingBucket('2026-10-31', '2026-10-31')).toBe('not_due');
    expect(ageingBucket('2026-10-31', '2026-10-01')).toBe('not_due');
    expect(ageingBucket('2026-10-01', '2026-10-02')).toBe('1-30');
    expect(ageingBucket('2026-10-01', '2026-10-31')).toBe('1-30');
    expect(ageingBucket('2026-10-01', '2026-11-01')).toBe('31-60');
    expect(ageingBucket('2026-07-01', '2026-10-01')).toBe('90+');
    expect(AGEING).toHaveLength(5);
  });
  it('splits employer cost across clients to the exact cent', () => {
    const out = allocateCost(1_000_001, { a: 100, b: 100, c: 100 });
    expect(Object.values(out).reduce((s, x) => s + x, 0)).toBe(1_000_001);
    expect(allocateCost(1000, { a: 3, b: 1 })).toEqual({ a: 750, b: 250 });
    expect(allocateCost(1000, {})).toEqual({});
    expect(allocateCost(1000, { a: 0 })).toEqual({});
  });
});
