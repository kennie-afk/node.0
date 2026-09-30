import { describe, expect, it } from 'vitest';
import { layoutDay, overlaps } from './calendar';
import { isoToLocalDate } from './dates';

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}`).toISOString();
const day = '2026-10-05';
const b = (id: number, from: string, to: string) => ({ id, startsAt: at(day, from), endsAt: at(day, to) });

describe('layoutDay', () => {
  it('puts non-overlapping bookings in one lane', () => {
    const placed = layoutDay([b(1, '09:00', '10:00'), b(2, '10:00', '11:00')], day);
    expect(placed.map((p) => [p.lane, p.lanes])).toEqual([[0, 1], [0, 1]]);
  });
  it('gives overlapping bookings their own lanes and a shared width', () => {
    const placed = layoutDay([b(1, '09:00', '11:00'), b(2, '10:00', '12:00'), b(3, '10:30', '11:30')], day);
    expect(placed.map((p) => p.lane)).toEqual([0, 1, 2]);
    expect(placed.every((p) => p.lanes === 3)).toBe(true);
  });
  it('does not widen a later, separate cluster', () => {
    const placed = layoutDay([b(1, '09:00', '10:00'), b(2, '09:30', '10:30'), b(3, '14:00', '15:00')], day);
    expect(placed.find((p) => p.item.id === 3)!.lanes).toBe(1);
    expect(placed.find((p) => p.item.id === 1)!.lanes).toBe(2);
  });
  it('reuses a freed lane', () => {
    const placed = layoutDay([b(1, '09:00', '10:00'), b(2, '09:30', '12:00'), b(3, '10:00', '11:00')], day);
    expect(placed.find((p) => p.item.id === 3)!.lane).toBe(0);
  });
  it('clips a booking that crosses midnight to the day drawn', () => {
    const spanning = { id: 9, startsAt: at(day, '22:00'), endsAt: at('2026-10-06', '02:00') };
    const first = layoutDay([spanning], day)[0];
    const second = layoutDay([spanning], '2026-10-06')[0];
    expect(first.endMinute).toBe(24 * 60);
    expect(second.startMinute).toBe(0);
    expect(second.endMinute).toBe(120);
    expect(layoutDay([spanning], '2026-10-07')).toHaveLength(0);
    expect(isoToLocalDate(spanning.startsAt)).toBe(day);
  });
  it('detects overlap as a half-open range', () => {
    expect(overlaps(b(1, '09:00', '10:00'), b(2, '10:00', '11:00'))).toBe(false);
    expect(overlaps(b(1, '09:00', '10:01'), b(2, '10:00', '11:00'))).toBe(true);
  });
});
