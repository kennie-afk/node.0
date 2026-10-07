import { afterAll, describe, expect, it, vi } from 'vitest';
import { addStaff, get, lastMonth, localInstant, makeGuard, makePlace, newTenant, on, pastShift, patch, post, setPay, shutdown, Tenant } from './helpers';
import { computePayslip, GuardPay, PaySettings } from '../src/payroll/compute';
import { splitByLocalDay, localDayOf } from '../src/common/time';

vi.setConfig({ testTimeout: 180_000 });
afterAll(shutdown);

const LM = lastMonth();
const at = (i: number, hhmm = '06:00') => localInstant(LM.days[i]!, hhmm);
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

const settings: PaySettings = { minWageCents: 3_000_000, allowancesCountTowardMin: false, standardMonthlyHours: 225, overtimeMultiplierBp: 15_000, restDayMultiplierBp: 20_000, holidayMultiplierBp: 20_000 };
const guard: GuardPay = { id: 'g', monthlyBasicCents: 3_000_000, allowanceCents: 0, restWeekday: null, hiredOn: '2026-01-01', exitedOn: null, nationalId: '1', nssfNo: '1', shaNo: '1', kraPin: 'A', psraRegNo: 'R', psraExpiry: null };
const base = { month: '2026-09', settings, holidays: new Set<string>(), adjustmentsCents: 0, tables: [] as never[] };

describe('a shift that crosses midnight is split by Nairobi calendar day (pure)', () => {
  it('splits 22:00 to 06:00 into 2h and 6h', () => {
    expect(splitByLocalDay(localInstant('2026-09-10', '22:00'), 480)).toEqual([{ day: '2026-09-10', minutes: 120 }, { day: '2026-09-11', minutes: 360 }]);
    // 21:00 UTC is local midnight: an instant just before it is still the earlier day
    expect(localDayOf(new Date('2026-09-10T20:59:00Z'))).toBe('2026-09-10');
    expect(splitByLocalDay(new Date('2026-09-10T20:59:00Z'), 2)).toEqual([{ day: '2026-09-10', minutes: 1 }, { day: '2026-09-11', minutes: 1 }]);
  });

  it('pays the holiday premium for the minutes that fall on the holiday, not for the start day', () => {
    const shifts = [{ day: '2026-09-10', windowStart: localInstant('2026-09-10', '22:00'), workedMinutes: 480, scheduledMinutes: 480, overtimeApprovedMinutes: 0 }];
    const slip = computePayslip({ ...base, guard, holidays: new Set(['2026-09-11']), shifts });
    expect(slip.breakdown.premiumMinutes).toEqual({ holiday: 360, restDay: 0 });
    expect(slip.premiumCents).toBe(160_000); // 6h x 2.0 x (3,000,000 / 225 per hour)
    // a holiday on the START day only gets the 2 hours before midnight
    const early = computePayslip({ ...base, guard, holidays: new Set(['2026-09-10']), shifts });
    expect(early.breakdown.premiumMinutes.holiday).toBe(120);
  });

  it('pays the rest-day premium for the minutes after midnight on the guard\'s rest day', () => {
    const shifts = [{ day: '2026-09-10', windowStart: localInstant('2026-09-10', '22:00'), workedMinutes: 480, scheduledMinutes: 480, overtimeApprovedMinutes: 0 }];
    const slip = computePayslip({ ...base, guard: { ...guard, restWeekday: weekday('2026-09-11') }, shifts });
    expect(slip.breakdown.premiumMinutes).toEqual({ holiday: 0, restDay: 360 });
    expect(slip.premiumCents).toBe(160_000);
  });
});

async function firm(name: string) {
  const t = await newTenant(name);
  const payroll = await addStaff(t, 'payroll');
  const place = await makePlace(t.owner.auth);
  return { t, payroll, place };
}
async function paid(t: Tenant, kes: number, over: Record<string, unknown> = {}) {
  const g = await makeGuard(t.owner.auth, over);
  await setPay(t.owner.auth, g.id, kes);
  await patch(t.owner.auth, `/v1/guards/${g.id}`, { hiredOn: LM.days[0] });
  return g;
}
const slipOf = async (payroll: { auth: any }, guardId: string) => {
  await post(payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
  return (await get(payroll.auth, `/v1/payroll/periods/${LM.month}/payslips?pageSize=100`)).body.items.find((s: { guardId: string }) => s.guardId === guardId);
};

describe.runIf(on)('overnight premiums in a real payroll run', () => {
  it('a night shift running into a public holiday, and one into a rest day, earn the premium for the minutes on that day', async () => {
    const { t, payroll, place } = await firm('Overnight Firm');
    const g = await paid(t, 30_000);
    await pastShift(t, place, g.id, at(2, '22:00'), { hours: 8 });
    expect((await post(t.owner.auth, '/v1/holidays', { day: LM.days[3], name: 'Overnight holiday' })).status).toBe(201);
    const h = await slipOf(payroll, g.id);
    expect(h.premiumCents).toBe(160_000);
    expect(h.breakdown.premiumMinutes).toEqual({ holiday: 360, restDay: 0 });

    const r = await paid(t, 30_000, { restWeekday: weekday(LM.days[5]!) });
    await pastShift(t, place, r.id, at(4, '22:00'), { hours: 8 });
    const rs = await slipOf(payroll, r.id);
    expect(rs.premiumCents).toBe(160_000);
    expect(rs.breakdown.premiumMinutes).toEqual({ holiday: 0, restDay: 360 });
  });
});

describe.runIf(on)('leave and the absence deduction', () => {
  it('approves leave by the right people, refuses overlaps and over-entitlement, and reports balances', async () => {
    const { t } = await firm('Leave Firm');
    const ops = await addStaff(t, 'ops_manager');
    const sup = await addStaff(t, 'supervisor');
    const g = await paid(t, 30_000);
    const ask = (over: Record<string, unknown> = {}) => post(sup.auth, '/v1/leave', { guardId: g.id, kind: 'annual', startDay: LM.days[1], endDay: LM.days[3], ...over });
    const r = await ask();
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'pending', days: 3 });
    expect((await ask({ startDay: LM.days[3], endDay: LM.days[4] })).status).toBe(409); // overlaps a live request
    expect((await ask({ kind: 'annual', startDay: LM.days[10], endDay: LM.days[14] })).status).toBe(201); // within 21
    expect((await post(sup.auth, `/v1/leave/${r.body.id}/decision`, { decision: 'approve' })).status).toBe(403); // a supervisor requests, does not approve
    expect((await post(ops.auth, `/v1/leave/${r.body.id}/decision`, { decision: 'reject' })).status).toBe(400); // a refusal needs a reason
    const ok = await post(ops.auth, `/v1/leave/${r.body.id}/decision`, { decision: 'approve' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('approved');
    expect((await post(ops.auth, `/v1/leave/${r.body.id}/decision`, { decision: 'approve' })).status).toBe(409);
    const big = await post(sup.auth, '/v1/leave', { guardId: g.id, kind: 'annual', startDay: '2027-01-01', endDay: '2027-01-30' });
    expect(big.status).toBe(409);
    expect(big.body.message).toMatch(/allows 21/);
    const bal = await get(ops.auth, `/v1/leave/balance/${g.id}?year=${LM.month.slice(0, 4)}`);
    expect(bal.body.annual.entitlement).toBe(21);
    expect(bal.body.annual.used).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify((await get(t.owner.auth, '/v1/audit')).body)).toContain('leave.approved');
  });

  it('leaves pay alone by default (and says so), then deducts unpaid leave and missed shifts once the employer switches it on', async () => {
    const { t, payroll, place } = await firm('Absence Firm');
    const ops = await addStaff(t, 'ops_manager');
    const g = await paid(t, 30_000);
    const dim = LM.days.length;
    const approve = async (body: Record<string, unknown>) => {
      const r = await post(ops.auth, '/v1/leave', { guardId: g.id, ...body });
      expect(r.status).toBe(201);
      expect((await post(ops.auth, `/v1/leave/${r.body.id}/decision`, { decision: 'approve' })).status).toBe(200);
    };
    await approve({ kind: 'unpaid', startDay: LM.days[8], endDay: LM.days[10] }); // 3 days
    await approve({ kind: 'sick', startDay: LM.days[12], endDay: LM.days[13] }); // paid: never deducted
    await pastShift(t, place, g.id, at(15), { inAfterMin: null }); // missed: counts only when asked
    await pastShift(t, place, g.id, at(9, '13:00'), { hours: 4, inAfterMin: null }); // missed but on a day of approved leave: not "missed"

    const off = await slipOf(payroll, g.id);
    expect(off.absenceDeductionCents).toBe(0);
    expect(off.grossCents).toBe(3_000_000);
    expect(off.flags.map((f: { code: string }) => f.code)).toContain('absence_not_deducted');

    expect((await patch(t.owner.auth, '/v1/settings', { absenceDeduction: 'unpaid_leave' })).status).toBe(200);
    const leaveOnly = await slipOf(payroll, g.id);
    expect(leaveOnly.absenceDeductionCents).toBe(Math.round((3_000_000 * 3) / dim));
    expect(leaveOnly.grossCents).toBe(3_000_000 - leaveOnly.absenceDeductionCents);

    expect((await patch(t.owner.auth, '/v1/settings', { absenceDeduction: 'unpaid_leave_and_missed' })).status).toBe(200);
    const both = await slipOf(payroll, g.id);
    expect(both.absenceDeductionCents).toBe(Math.round((3_000_000 * 4) / dim)); // 3 unpaid days + the one missed day; the shift on leave is not counted twice
    expect(both.breakdown.absence).toMatchObject({ unpaidLeaveDays: 3, missedShiftDays: 1, deductedDays: 4 });
    expect(both.flags.map((f: { code: string }) => f.code)).not.toContain('absence_not_deducted');
    expect(both.netCents).toBeLessThan(off.netCents);
  });
});
