import { describe, expect, it } from 'vitest';
import {
  AGEING_BUCKETS, addMonthsToDay, allocateRepayment, arrearsAsAt, bucketFor, buildSchedule, daysBetween, penaltyFor, totals
} from '../src/loans/schedule';

const base = { firstDueDate: '2026-02-28' };

describe('flat schedules', () => {
  it('spreads interest and principal evenly, and the rows add up to exactly the principal plus the interest', () => {
    const rows = buildSchedule({ principalCents: 120_000_00, termMonths: 12, annualRateBp: 1200, method: 'flat', ...base });
    expect(rows).toHaveLength(12);
    const t = totals(rows);
    expect(t.principalCents).toBe(120_000_00);
    // 12% a year on 120,000 for 12 months = 14,400 interest
    expect(t.interestCents).toBe(14_400_00);
    expect(rows[0]!.principalCents).toBe(10_000_00);
    expect(rows[0]!.interestCents).toBe(1_200_00);
  });
  it('puts the odd cents on the last instalment so nothing is lost to rounding', () => {
    const rows = buildSchedule({ principalCents: 100_000_01, termMonths: 3, annualRateBp: 1000, method: 'flat', ...base });
    expect(totals(rows).principalCents).toBe(100_000_01);
    const interest = Math.round((100_000_01 * 1000 * 3) / 120_000);
    expect(totals(rows).interestCents).toBe(interest);
  });
  it('charges nothing at a zero rate', () => {
    expect(totals(buildSchedule({ principalCents: 5_000_00, termMonths: 5, annualRateBp: 0, method: 'flat', ...base })).interestCents).toBe(0);
  });
});

describe('reducing-balance schedules', () => {
  it('matches the standard annuity: 100,000 at 12% a year over 12 months is 8,884.88 a month', () => {
    const rows = buildSchedule({ principalCents: 100_000_00, termMonths: 12, annualRateBp: 1200, method: 'reducing', ...base });
    expect(rows[0]!.principalCents + rows[0]!.interestCents).toBe(8_884_88);
    expect(rows[0]!.interestCents).toBe(1_000_00); // 1% of the opening balance
    expect(totals(rows).principalCents).toBe(100_000_00);
    // the last instalment clears the exact balance and is within a few cents of the others
    const last = rows[11]!;
    expect(Math.abs(last.principalCents + last.interestCents - 8_884_88)).toBeLessThan(20);
  });
  it('interest falls and principal rises through the term', () => {
    const rows = buildSchedule({ principalCents: 60_000_00, termMonths: 6, annualRateBp: 1800, method: 'reducing', ...base });
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.interestCents).toBeLessThanOrEqual(rows[i - 1]!.interestCents);
      expect(rows[i]!.principalCents).toBeGreaterThanOrEqual(rows[i - 1]!.principalCents - 1);
    }
  });
  it('divides evenly at a zero rate', () => {
    const rows = buildSchedule({ principalCents: 12_000_00, termMonths: 4, annualRateBp: 0, method: 'reducing', ...base });
    expect(rows.map((r) => r.principalCents)).toEqual([3_000_00, 3_000_00, 3_000_00, 3_000_00]);
  });
  it('survives very large loans (the arithmetic is BigInt, not float)', () => {
    const rows = buildSchedule({ principalCents: 9_000_000_000_00, termMonths: 360, annualRateBp: 1500, method: 'flat', ...base });
    expect(totals(rows).principalCents).toBe(9_000_000_000_00);
  });
  it('refuses nonsense instead of inventing a schedule', () => {
    expect(() => buildSchedule({ principalCents: 0, termMonths: 6, annualRateBp: 1000, method: 'flat', ...base })).toThrow();
    expect(() => buildSchedule({ principalCents: 100, termMonths: 0, annualRateBp: 1000, method: 'flat', ...base })).toThrow();
    expect(() => buildSchedule({ principalCents: 100.5, termMonths: 6, annualRateBp: 1000, method: 'flat', ...base })).toThrow();
    expect(() => buildSchedule({ principalCents: 100, termMonths: 6, annualRateBp: 1000, method: 'flat', firstDueDate: '2026-02-30' })).toThrow();
  });
});

describe('dates', () => {
  it('keeps the day of the month and clamps to a short month', () => {
    expect(addMonthsToDay('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDay('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsToDay('2026-11-15', 3)).toBe('2027-02-15');
    expect(buildSchedule({ principalCents: 3000, termMonths: 3, annualRateBp: 0, method: 'flat', firstDueDate: '2026-01-31' }).map((r) => r.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
  it('counts days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
  });
});

describe('repayment allocation', () => {
  const rows = [1, 2, 3].map((n) => ({ installmentNo: n, principalCents: 10_000, interestCents: 2_000, penaltyCents: 0, paidPrincipalCents: 0, paidInterestCents: 0, paidPenaltyCents: 0 }));

  it('pays penalty, then interest, then principal, oldest instalment first', () => {
    const owed = [{ ...rows[0]!, penaltyCents: 500 }, rows[1]!];
    const a = allocateRepayment(13_000, owed);
    expect(a.lines[0]).toEqual({ installmentNo: 1, penaltyCents: 500, interestCents: 2_000, principalCents: 10_000 });
    expect(a.lines[1]).toEqual({ installmentNo: 2, penaltyCents: 0, interestCents: 500, principalCents: 0 });
    expect(a.penaltyCents + a.interestCents + a.principalCents + a.unappliedCents).toBe(13_000);
  });
  it('a part payment goes to interest before principal', () => {
    const a = allocateRepayment(1_500, rows);
    expect(a).toMatchObject({ penaltyCents: 0, interestCents: 1_500, principalCents: 0, unappliedCents: 0 });
  });
  it('an early large payment clears later instalments in order rather than being parked', () => {
    const a = allocateRepayment(24_000, rows);
    expect(a.lines.map((l) => l.installmentNo)).toEqual([1, 2]);
    expect(a.principalCents).toBe(20_000);
  });
  it('what is left after the last instalment is returned as unapplied, never lost', () => {
    const a = allocateRepayment(100_000, rows);
    expect(a.unappliedCents).toBe(100_000 - 36_000);
    expect(a.penaltyCents + a.interestCents + a.principalCents + a.unappliedCents).toBe(100_000);
  });
  it('skips what is already paid', () => {
    const paid = [{ ...rows[0]!, paidPrincipalCents: 10_000, paidInterestCents: 2_000 }, rows[1]!];
    expect(allocateRepayment(12_000, paid).lines[0]!.installmentNo).toBe(2);
  });
  it('refuses a zero or fractional payment', () => {
    expect(() => allocateRepayment(0, rows)).toThrow();
    expect(() => allocateRepayment(10.5, rows)).toThrow();
  });
});

describe('arrears and ageing', () => {
  const rows = [
    { installmentNo: 1, dueDate: '2026-01-31', principalCents: 10_000, interestCents: 1_000, penaltyCents: 200, paidPrincipalCents: 0, paidInterestCents: 0, paidPenaltyCents: 0 },
    { installmentNo: 2, dueDate: '2026-02-28', principalCents: 10_000, interestCents: 1_000, penaltyCents: 0, paidPrincipalCents: 0, paidInterestCents: 0, paidPenaltyCents: 0 },
    { installmentNo: 3, dueDate: '2026-06-30', principalCents: 10_000, interestCents: 1_000, penaltyCents: 0, paidPrincipalCents: 0, paidInterestCents: 0, paidPenaltyCents: 0 }
  ];
  it('measures days from the oldest unpaid instalment and ignores ones not yet due', () => {
    const a = arrearsAsAt('2026-03-31', rows);
    expect(a).toEqual({ overduePrincipalCents: 20_000, overdueInterestCents: 2_000, overduePenaltyCents: 200, daysOverdue: 59 });
  });
  it('is zero when everything due is paid', () => {
    const paid = rows.map((r, i) => (i < 2 ? { ...r, paidPrincipalCents: 10_000, paidInterestCents: 1_000, paidPenaltyCents: r.penaltyCents } : r));
    expect(arrearsAsAt('2026-03-31', paid).daysOverdue).toBe(0);
  });
  it('puts the days into the standard buckets', () => {
    expect([0, 1, 30, 31, 60, 61, 90, 91, 180, 181].map(bucketFor)).toEqual(['current', '1-30', '1-30', '31-60', '31-60', '61-90', '61-90', '91-180', '91-180', '180+']);
    expect(AGEING_BUCKETS).toHaveLength(6);
  });
  it('charges a month of penalty on the overdue amount', () => {
    expect(penaltyFor(11_000, 500)).toBe(550);
    expect(penaltyFor(0, 500)).toBe(0);
    expect(penaltyFor(11_000, 0)).toBe(0);
  });
});
