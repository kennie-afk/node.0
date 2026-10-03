import { describe, expect, it } from 'vitest';
import { checkWindow, classifyShift, effectiveAttendance, EventRow, verifiedMinutes, workedMinutes } from '../src/ops/attendance';

const D = (s: string) => new Date(s);
const rules = { checkinEarlyMinutes: 60, lateGraceMinutes: 10, missedAfterMinutes: 60 };
const shift = { startAt: D('2026-10-05T15:00:00Z'), endAt: D('2026-10-06T03:00:00Z'), scheduledMinutes: 720 };
const ev = (id: number, kind: EventRow['kind'], at: string, effective = at): EventRow => ({ id, kind, at: D(at), effectiveAt: D(effective) });

describe('effective attendance', () => {
  it('none: nothing', () => expect(effectiveAttendance([])).toEqual({ inAt: null, outAt: null, inOverridden: false, outOverridden: false }));
  it('uses the server-stamped in and out', () => {
    const a = effectiveAttendance([ev(1, 'in', '2026-10-05T15:02:00Z'), ev(2, 'out', '2026-10-06T03:01:00Z')]);
    expect(a.inAt).toEqual(D('2026-10-05T15:02:00Z'));
    expect(a.outAt).toEqual(D('2026-10-06T03:01:00Z'));
  });
  it('an override replaces the time but is flagged', () => {
    const a = effectiveAttendance([ev(1, 'in', '2026-10-05T16:30:00Z'), ev(2, 'override_in', '2026-10-06T08:00:00Z', '2026-10-05T15:00:00Z')]);
    expect(a.inAt).toEqual(D('2026-10-05T15:00:00Z'));
    expect(a.inOverridden).toBe(true);
  });
  it('the latest override wins, whatever order the array is in', () => {
    const a = effectiveAttendance([ev(5, 'override_out', '2026-10-06T09:00:00Z', '2026-10-06T02:00:00Z'), ev(3, 'override_out', '2026-10-06T08:00:00Z', '2026-10-06T01:00:00Z')]);
    expect(a.outAt).toEqual(D('2026-10-06T02:00:00Z'));
  });
});

describe('classifyShift', () => {
  const none = effectiveAttendance([]);
  it('upcoming before the start', () => expect(classifyShift(shift, none, D('2026-10-05T10:00:00Z'), rules).state).toBe('upcoming'));
  it('awaiting just after the start', () => expect(classifyShift(shift, none, D('2026-10-05T15:20:00Z'), rules).state).toBe('awaiting'));
  it('missed an hour after the start with no check-in', () => expect(classifyShift(shift, none, D('2026-10-05T16:00:00Z'), rules).state).toBe('missed'));
  it('on time within grace is not late', () => {
    const att = effectiveAttendance([ev(1, 'in', '2026-10-05T15:10:00Z')]);
    expect(classifyShift(shift, att, D('2026-10-05T20:00:00Z'), rules)).toEqual({ state: 'on_site', late: false, lateMinutes: 0 });
  });
  it('late beyond grace reports the minutes', () => {
    const att = effectiveAttendance([ev(1, 'in', '2026-10-05T15:25:00Z')]);
    expect(classifyShift(shift, att, D('2026-10-05T20:00:00Z'), rules)).toEqual({ state: 'on_site', late: true, lateMinutes: 25 });
  });
  it('an early arrival is never late', () => {
    const att = effectiveAttendance([ev(1, 'in', '2026-10-05T14:30:00Z')]);
    expect(classifyShift(shift, att, D('2026-10-05T20:00:00Z'), rules).late).toBe(false);
  });
  it('checked in but never out, long after the end: needs a supervisor', () => {
    const att = effectiveAttendance([ev(1, 'in', '2026-10-05T15:00:00Z')]);
    expect(classifyShift(shift, att, D('2026-10-06T05:00:00Z'), rules).state).toBe('no_checkout');
    expect(classifyShift(shift, att, D('2026-10-06T03:30:00Z'), rules).state).toBe('on_site');
  });
  it('completed with both', () => {
    const att = effectiveAttendance([ev(1, 'in', '2026-10-05T15:00:00Z'), ev(2, 'out', '2026-10-06T03:00:00Z')]);
    expect(classifyShift(shift, att, D('2026-10-07T00:00:00Z'), rules).state).toBe('completed');
  });
  it('a cancelled shift is cancelled whatever happened', () => expect(classifyShift({ ...shift, cancelled: true }, none, D('2026-10-05T20:00:00Z'), rules).state).toBe('cancelled'));
});

describe('check window', () => {
  const none = effectiveAttendance([]);
  it('opens an hour before the start', () => {
    expect(checkWindow(shift, 'in', none, D('2026-10-05T13:59:00Z'), rules)).toMatch(/Too early/);
    expect(checkWindow(shift, 'in', none, D('2026-10-05T14:00:00Z'), rules)).toBeNull();
  });
  it('closes at the end of the shift', () => {
    expect(checkWindow(shift, 'in', none, D('2026-10-06T03:00:01Z'), rules)).toMatch(/override/);
  });
  it('refuses a second check-in', () => {
    expect(checkWindow(shift, 'in', effectiveAttendance([ev(1, 'in', '2026-10-05T15:00:00Z')]), D('2026-10-05T16:00:00Z'), rules)).toMatch(/already/);
  });
  it('refuses check-out without check-in, and a second check-out', () => {
    expect(checkWindow(shift, 'out', none, D('2026-10-06T03:00:00Z'), rules)).toMatch(/no check-in/);
    const done = effectiveAttendance([ev(1, 'in', '2026-10-05T15:00:00Z'), ev(2, 'out', '2026-10-06T03:00:00Z')]);
    expect(checkWindow(shift, 'out', done, D('2026-10-06T03:05:00Z'), rules)).toMatch(/already/);
  });
});

describe('verified and worked minutes', () => {
  const att = (i: string, o: string) => effectiveAttendance([ev(1, 'in', i), ev(2, 'out', o)]);
  it('no out means nothing verified', () => expect(verifiedMinutes(shift, effectiveAttendance([ev(1, 'in', '2026-10-05T15:00:00Z')]), 'actual', 10)).toBe(0));
  it('full shift', () => expect(verifiedMinutes(shift, att('2026-10-05T15:00:00Z', '2026-10-06T03:00:00Z'), 'actual', 10)).toBe(720));
  it('actual basis bills only the time present', () => expect(verifiedMinutes(shift, att('2026-10-05T17:00:00Z', '2026-10-06T03:00:00Z'), 'actual', 10)).toBe(600));
  it('scheduled basis forgives a shortfall inside the grace', () => expect(verifiedMinutes(shift, att('2026-10-05T15:08:00Z', '2026-10-06T03:00:00Z'), 'scheduled', 10)).toBe(720));
  it('scheduled basis bills actual when the shortfall exceeds the grace', () => expect(verifiedMinutes(shift, att('2026-10-05T15:30:00Z', '2026-10-06T03:00:00Z'), 'scheduled', 10)).toBe(690));
  it('time outside the scheduled window is not billed', () => expect(verifiedMinutes(shift, att('2026-10-05T13:00:00Z', '2026-10-06T06:00:00Z'), 'actual', 10)).toBe(720));
  it('worked minutes are capped at scheduled plus approved overtime', () => {
    const a = att('2026-10-05T15:00:00Z', '2026-10-06T06:00:00Z'); // 15h
    expect(workedMinutes(shift, a)).toBe(720);
    expect(workedMinutes({ ...shift, overtimeApprovedMinutes: 120 }, a)).toBe(840);
    expect(workedMinutes({ ...shift, overtimeApprovedMinutes: 600 }, a)).toBe(900);
  });
});
