import { describe, expect, it } from 'vitest';
import { expand, formatRule, parseRule, type Rule } from '../src/events/recurrence';

const rule = (text: string): Rule => {
  const parsed = parseRule(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.rule;
};
const days = (r: string, start: string, from: string, to: string, limit?: number) =>
  expand(rule(r), new Date(start), from, to, limit).starts.map((d) => d.toISOString().slice(0, 16));

describe('recurrence rules', () => {
  it('weekly on the start weekday, every 2 weeks, bounded by COUNT', () => {
    expect(days('FREQ=WEEKLY;INTERVAL=2;COUNT=3', '2026-10-04T09:00:00Z', '2026-01-01', '2027-01-01')).toEqual(['2026-10-04T09:00', '2026-10-18T09:00', '2026-11-01T09:00']);
  });

  it('weekly BYDAY keeps the order and never goes before the first occurrence', () => {
    // Start on a Wednesday: the Monday of that week (the 5th) is before the start and is skipped; weeks run Monday to Sunday.
    expect(days('FREQ=WEEKLY;BYDAY=SU,MO,WE', '2026-10-07T18:00:00Z', '2026-10-01', '2026-10-19')).toEqual(['2026-10-07T18:00', '2026-10-11T18:00', '2026-10-12T18:00', '2026-10-14T18:00', '2026-10-18T18:00', '2026-10-19T18:00']);
  });

  it('COUNT counts from the series start even when the window is later', () => {
    // 10 Sundays from 4 Oct: the window starts after the 3rd, so only 7 remain.
    expect(days('FREQ=WEEKLY;COUNT=10', '2026-10-04T09:00:00Z', '2026-10-25', '2027-12-31')).toHaveLength(7);
    expect(days('FREQ=DAILY;COUNT=10', '2026-10-01T09:00:00Z', '2026-10-09', '2026-12-31')).toEqual(['2026-10-09T09:00', '2026-10-10T09:00']);
    expect(days('FREQ=DAILY;COUNT=10', '2026-10-01T09:00:00Z', '2026-11-01', '2026-12-31')).toEqual([]);
  });

  it('UNTIL is inclusive', () => {
    expect(days('FREQ=DAILY;INTERVAL=2;UNTIL=20261007', '2026-10-01T09:00:00Z', '2026-10-01', '2026-12-31')).toEqual(['2026-10-01T09:00', '2026-10-03T09:00', '2026-10-05T09:00', '2026-10-07T09:00']);
  });

  it('monthly keeps the day of the month and skips months without it', () => {
    expect(days('FREQ=MONTHLY;COUNT=4', '2026-01-31T10:00:00Z', '2026-01-01', '2026-12-31')).toEqual(['2026-01-31T10:00', '2026-03-31T10:00', '2026-05-31T10:00', '2026-07-31T10:00']);
    expect(days('FREQ=MONTHLY;INTERVAL=3', '2026-02-15T10:00:00Z', '2026-01-01', '2027-02-28')).toEqual(['2026-02-15T10:00', '2026-05-15T10:00', '2026-08-15T10:00', '2026-11-15T10:00', '2027-02-15T10:00']);
  });

  it('limits the answer and says so', () => {
    const r = expand(rule('FREQ=DAILY'), new Date('2026-01-01T09:00:00Z'), '2026-01-01', '2026-12-31', 5);
    expect(r.starts).toHaveLength(5);
    expect(r.truncated).toBe(true);
  });

  it('refuses what it cannot honour, with the reason', () => {
    for (const bad of ['', 'Every Sunday', 'FREQ=YEARLY', 'FREQ=WEEKLY;BYMONTH=1', 'FREQ=DAILY;BYDAY=MO', 'FREQ=WEEKLY;COUNT=2;UNTIL=20261231', 'FREQ=DAILY;INTERVAL=0', 'FREQ=DAILY;COUNT=5000', 'FREQ=WEEKLY;BYDAY=XX', 'FREQ=DAILY;UNTIL=soon', 'FREQ=DAILY;FREQ=WEEKLY']) {
      expect('error' in parseRule(bad), bad).toBe(true);
    }
    expect(formatRule(rule('rrule:FREQ=WEEKLY;BYDAY=su,we;UNTIL=2026-12-31'))).toBe('FREQ=WEEKLY;BYDAY=SU,WE;UNTIL=20261231');
  });
});
