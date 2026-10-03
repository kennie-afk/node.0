/**
 * Attendance rules, as pure functions over a shift and its events. The server clock stamps every event; nothing here reads a device's time.
 */
export interface ShiftTimes {
  startAt: Date;
  endAt: Date;
  scheduledMinutes: number;
  overtimeApprovedMinutes?: number;
}

export interface EventRow {
  kind: 'in' | 'out' | 'override_in' | 'override_out';
  at: Date;
  effectiveAt: Date;
  /** event order; the latest override wins */
  id: number;
}

export interface Rules {
  checkinEarlyMinutes: number;
  lateGraceMinutes: number;
  missedAfterMinutes: number;
}

export interface Effective {
  inAt: Date | null;
  outAt: Date | null;
  inOverridden: boolean;
  outOverridden: boolean;
}

const MIN = 60_000;

export function effectiveAttendance(events: readonly EventRow[]): Effective {
  const latest = (kind: EventRow['kind']) => events.filter((e) => e.kind === kind).sort((a, b) => b.id - a.id)[0];
  const overrideIn = latest('override_in');
  const overrideOut = latest('override_out');
  const rawIn = latest('in');
  const rawOut = latest('out');
  return {
    inAt: overrideIn ? overrideIn.effectiveAt : rawIn ? rawIn.at : null,
    outAt: overrideOut ? overrideOut.effectiveAt : rawOut ? rawOut.at : null,
    inOverridden: !!overrideIn,
    outOverridden: !!overrideOut
  };
}

export type ShiftState = 'upcoming' | 'awaiting' | 'missed' | 'on_site' | 'no_checkout' | 'completed' | 'cancelled';

export interface Classified {
  state: ShiftState;
  late: boolean;
  lateMinutes: number;
}

export function classifyShift(shift: ShiftTimes & { cancelled?: boolean }, att: Effective, now: Date, rules: Rules): Classified {
  if (shift.cancelled) return { state: 'cancelled', late: false, lateMinutes: 0 };
  const lateBy = att.inAt ? Math.max(0, Math.floor((att.inAt.getTime() - shift.startAt.getTime()) / MIN)) : 0;
  const late = lateBy > rules.lateGraceMinutes;
  const lateMinutes = late ? lateBy : 0;
  if (att.inAt && att.outAt) return { state: 'completed', late, lateMinutes };
  if (att.inAt) {
    // checked in, never checked out, and the shift ended a while ago: a supervisor must look
    const overdue = now.getTime() > shift.endAt.getTime() + rules.missedAfterMinutes * MIN;
    return { state: overdue ? 'no_checkout' : 'on_site', late, lateMinutes };
  }
  if (now.getTime() < shift.startAt.getTime()) return { state: 'upcoming', late: false, lateMinutes: 0 };
  const missed = now.getTime() >= shift.startAt.getTime() + rules.missedAfterMinutes * MIN;
  return { state: missed ? 'missed' : 'awaiting', late: false, lateMinutes: 0 };
}

/** May an event of this kind be recorded now? Returns a reason when not. */
export function checkWindow(shift: ShiftTimes, kind: 'in' | 'out', att: Effective, now: Date, rules: Rules): string | null {
  if (kind === 'in') {
    if (att.inAt) return 'This shift already has a check-in.';
    if (now.getTime() < shift.startAt.getTime() - rules.checkinEarlyMinutes * MIN) return `Too early: check-in opens ${rules.checkinEarlyMinutes} minutes before the shift starts.`;
    if (now.getTime() > shift.endAt.getTime()) return 'The shift has ended; a supervisor can correct it with an override and a reason.';
    return null;
  }
  if (!att.inAt) return 'There is no check-in for this shift yet.';
  if (att.outAt) return 'This shift already has a check-out.';
  return null;
}

/**
 * Minutes that count as verified presence. Needs a check-in AND a check-out. 'actual' bills the minutes between them, never more than the
 * scheduled shift; 'scheduled' bills the whole scheduled shift when the actual time is within the grace of it, otherwise the actual.
 */
export function verifiedMinutes(shift: ShiftTimes, att: Effective, basis: 'scheduled' | 'actual', graceMinutes: number): number {
  if (!att.inAt || !att.outAt) return 0;
  // time before the scheduled start, or after the scheduled end, does not count as scheduled time
  const start = Math.max(att.inAt.getTime(), shift.startAt.getTime());
  const end = Math.min(att.outAt.getTime(), shift.endAt.getTime());
  const actual = Math.max(0, Math.floor((end - start) / MIN));
  const capped = Math.min(actual, shift.scheduledMinutes);
  if (basis === 'actual') return capped;
  return capped + graceMinutes >= shift.scheduledMinutes ? shift.scheduledMinutes : capped;
}

/** Minutes actually on site (check-in to check-out), for pay: scheduled plus any approved overtime at most. */
export function workedMinutes(shift: ShiftTimes, att: Effective): number {
  if (!att.inAt || !att.outAt) return 0;
  const raw = Math.max(0, Math.floor((att.outAt.getTime() - att.inAt.getTime()) / MIN));
  return Math.min(raw, shift.scheduledMinutes + (shift.overtimeApprovedMinutes ?? 0));
}
