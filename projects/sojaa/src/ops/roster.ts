/**
 * Roster rules as pure functions. The database enforces the one hard rule (no overlapping shifts for a guard); these produce the
 * messages, and the optional limits (weekly hours, rest between shifts) that a firm switches on. Sojaa ships with NO limit enforced and
 * asserts no legal figure: the limits are whatever the firm sets.
 */
export interface Slot {
  start: Date;
  end: Date;
}

export interface RosterLimits {
  maxHoursPerWeek: number | null;
  minRestHours: number | null;
}

export type ConflictKind = 'double_booked' | 'rest_too_short' | 'weekly_hours_exceeded';

export interface Conflict {
  kind: ConflictKind;
  message: string;
}

const HOUR = 3_600_000;

export const overlaps = (a: Slot, b: Slot) => a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

/** The Monday (YYYY-MM-DD) of the local week a moment falls in. */
export function weekStartKey(at: Date, timeZone = 'Africa/Nairobi'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  const day = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))) - weekday * 86_400_000;
  return new Date(day).toISOString().slice(0, 10);
}

export function rosterConflicts(candidate: Slot, others: readonly Slot[], limits: RosterLimits, timeZone = 'Africa/Nairobi'): Conflict[] {
  const found: Conflict[] = [];
  if (others.some((o) => overlaps(candidate, o))) found.push({ kind: 'double_booked', message: 'This guard is already on another shift at that time.' });

  if (limits.minRestHours !== null) {
    const need = limits.minRestHours * HOUR;
    const tooClose = others.some((o) => !overlaps(candidate, o) && (o.end.getTime() <= candidate.start.getTime() ? candidate.start.getTime() - o.end.getTime() : o.start.getTime() - candidate.end.getTime()) < need);
    if (tooClose) found.push({ kind: 'rest_too_short', message: `Less than ${limits.minRestHours} hours of rest between this and another shift (your own limit).` });
  }

  if (limits.maxHoursPerWeek !== null) {
    const week = weekStartKey(candidate.start, timeZone);
    const sameWeek = others.filter((o) => weekStartKey(o.start, timeZone) === week);
    const hours = [...sameWeek, candidate].reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()) / HOUR, 0);
    if (hours > limits.maxHoursPerWeek) found.push({ kind: 'weekly_hours_exceeded', message: `That makes ${Math.round(hours * 10) / 10} scheduled hours in the week, over your limit of ${limits.maxHoursPerWeek}.` });
  }
  return found;
}

/** Minutes between two clock times (HH:MM[:SS]) allowing the shift to cross midnight. */
export function templateMinutes(start: string, end: string): number {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(end) - toMin(start);
  return diff > 0 ? diff : diff + 1440;
}
