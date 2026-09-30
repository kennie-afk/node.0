import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, startOfWeek, weekDays } from './dates';

describe('calendar dates', () => {
  it('finds Monday for any day of the week, Sunday included', () => {
    expect(startOfWeek('2026-10-07')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
  });
  it('crosses month and year ends without drifting', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekDays('2026-12-30')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });
  it('counts whole days', () => {
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7);
  });
});
