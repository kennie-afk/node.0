/**
 * Recurrence for events, a deliberate subset of RFC 5545 RRULE, stored as text in
 * `events.recurrencePattern`, expanded on read for a date window (nothing is materialised, so
 * editing a series cannot leave stale rows behind):
 *
 *   FREQ=DAILY|WEEKLY|MONTHLY   required
 *   INTERVAL=n                  every n days/weeks/months (1-52, default 1)
 *   BYDAY=SU,MO,...             WEEKLY only; default is the weekday of the first occurrence
 *   COUNT=n                     stop after n occurrences (1-1000)   } at most one of COUNT / UNTIL
 *   UNTIL=YYYYMMDD              last day an occurrence may fall on  }
 *
 * Monthly repeats keep the first occurrence's day of the month and skip months that lack it
 * (the 31st), as RFC 5545 specifies. All calendar arithmetic is on UTC dates: Kenya has no
 * daylight saving, and the time of day of every occurrence is the first occurrence's.
 */
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface Rule {
  freq: Frequency;
  interval: number;
  byDay: number[]; // 0 = Sunday ... 6 = Saturday
  count: number | null;
  until: string | null; // YYYY-MM-DD
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_MS = 86_400_000;

/** Parses a rule, or returns the reason it is not acceptable. */
export function parseRule(text: string): { rule: Rule } | { error: string } {
  const parts = new Map<string, string>();
  for (const piece of text.trim().replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = piece.split('=');
    if (!k || v === undefined || v === '') return { error: `"${piece}" is not KEY=VALUE` };
    const key = k.trim().toUpperCase();
    if (parts.has(key)) return { error: `${key} appears twice` };
    parts.set(key, v.trim().toUpperCase());
  }
  const unknown = [...parts.keys()].filter((k) => !['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL'].includes(k));
  if (unknown.length) return { error: `${unknown.join(', ')} is not supported (use FREQ, INTERVAL, BYDAY, COUNT, UNTIL)` };
  const freq = parts.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return { error: 'FREQ must be DAILY, WEEKLY or MONTHLY' };
  const interval = parts.has('INTERVAL') ? Number(parts.get('INTERVAL')) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) return { error: 'INTERVAL must be a whole number from 1 to 52' };
  let byDay: number[] = [];
  if (parts.has('BYDAY')) {
    if (freq !== 'WEEKLY') return { error: 'BYDAY is only supported with FREQ=WEEKLY' };
    const days = parts.get('BYDAY')!.split(',').map((d) => DAYS.indexOf(d));
    if (days.some((d) => d < 0)) return { error: 'BYDAY must list days from SU,MO,TU,WE,TH,FR,SA' };
    byDay = [...new Set(days)].sort((a, b) => a - b);
  }
  if (parts.has('COUNT') && parts.has('UNTIL')) return { error: 'use COUNT or UNTIL, not both' };
  let count: number | null = null;
  if (parts.has('COUNT')) {
    count = Number(parts.get('COUNT'));
    if (!Number.isInteger(count) || count < 1 || count > 1000) return { error: 'COUNT must be a whole number from 1 to 1000' };
  }
  let until: string | null = null;
  if (parts.has('UNTIL')) {
    const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(parts.get('UNTIL')!);
    if (!m || Number.isNaN(Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`))) return { error: 'UNTIL must be a date like 20261231' };
    until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  return { rule: { freq, interval, byDay, count, until } };
}

export function formatRule(rule: Rule): string {
  return [
    `FREQ=${rule.freq}`,
    rule.interval !== 1 ? `INTERVAL=${rule.interval}` : null,
    rule.byDay.length ? `BYDAY=${rule.byDay.map((d) => DAYS[d]).join(',')}` : null,
    rule.count ? `COUNT=${rule.count}` : null,
    rule.until ? `UNTIL=${rule.until.replace(/-/g, '')}` : null
  ].filter(Boolean).join(';');
}

const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Occurrence start instants within [from, to] (inclusive calendar days, YYYY-MM-DD), in order.
 * `start` is the first occurrence. `limit` bounds the answer; `truncated` says it was hit.
 */
export function expand(rule: Rule, start: Date, from: string, to: string, limit = 500): { starts: Date[]; truncated: boolean } {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const untilMs = rule.until ? Date.parse(`${rule.until}T00:00:00Z`) : Infinity;
  const lastMs = Math.min(toMs, untilMs);
  const firstDay = startOfDay(start);
  const timeOfDay = start.getTime() - firstDay;
  const out: Date[] = [];
  let produced = 0; // occurrences generated so far, for COUNT
  let truncated = false;

  const emit = (dayMs: number): boolean => {
    produced += 1;
    if (rule.count !== null && produced > rule.count) return false;
    if (dayMs > lastMs) return false;
    if (dayMs >= fromMs) {
      if (out.length >= limit) { truncated = true; return false; }
      out.push(new Date(dayMs + timeOfDay));
    }
    return true;
  };

  if (rule.freq === 'DAILY') {
    const step = rule.interval * DAY_MS;
    // Jump straight to the first candidate in the window, keeping the index for COUNT.
    let i = fromMs > firstDay ? Math.floor((fromMs - firstDay) / step) : 0;
    if (rule.count !== null && i >= rule.count) return { starts: [], truncated: false };
    produced = i;
    for (; ; i += 1) if (!emit(firstDay + i * step)) break;
  } else if (rule.freq === 'WEEKLY') {
    const days = rule.byDay.length ? rule.byDay : [start.getUTCDay()];
    // Weeks start on Monday (RFC 5545 default WKST=MO).
    const weekStart = firstDay - ((start.getUTCDay() + 6) % 7) * DAY_MS;
    let stop = false;
    for (let w = 0; !stop && weekStart + w * rule.interval * 7 * DAY_MS <= lastMs; w += 1) {
      const base = weekStart + w * rule.interval * 7 * DAY_MS;
      const ordered = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      for (const d of ordered) {
        const dayMs = base + ((d + 6) % 7) * DAY_MS;
        if (dayMs < firstDay) continue;
        if (!emit(dayMs)) { stop = true; break; }
      }
      if (w > 20000) break;
    }
  } else {
    const dom = start.getUTCDate();
    for (let m = 0; m < 20000; m += 1) {
      const months = start.getUTCMonth() + m * rule.interval;
      const y = start.getUTCFullYear() + Math.floor(months / 12);
      const mo = ((months % 12) + 12) % 12;
      const dayMs = Date.UTC(y, mo, dom);
      if (new Date(dayMs).getUTCMonth() !== mo) continue; // no 31st in this month: skipped, per RFC 5545
      if (!emit(dayMs)) break;
    }
  }
  return { starts: out, truncated };
}

export { dayKey };
