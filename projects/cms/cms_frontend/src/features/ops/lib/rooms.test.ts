import { describe, expect, it } from 'vitest';
import type { Room } from '../../../api/checkinApi';
import { ageInMonths, ageLabel, roomProblem, suggestRoom } from './rooms';

const room = (over: Partial<Room>): Room => ({ id: 1, name: 'Nursery', minAgeMonths: 0, maxAgeMonths: 36, capacity: 10, isActive: true, present: 0, ...over });

describe('room rules', () => {
  it('computes age in whole months', () => {
    expect(ageInMonths('2024-03-15', new Date('2026-09-14T00:00:00Z'))).toBe(29);
    expect(ageInMonths('2024-03-15', new Date('2026-09-15T00:00:00Z'))).toBe(30);
    expect(ageInMonths('2030-01-01', new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });
  it('labels infants in months and older children in years', () => {
    expect(ageLabel(18)).toBe('18 mo');
    expect(ageLabel(60)).toBe('5 yr');
  });
  it('suggests the tightest open band', () => {
    const rooms = [room({ id: 1, name: 'Little ones', maxAgeMonths: 72 }), room({ id: 2, name: 'Toddlers', minAgeMonths: 13, maxAgeMonths: 36 })];
    expect(suggestRoom(rooms, 24)?.name).toBe('Toddlers');
    expect(suggestRoom(rooms, 50)?.name).toBe('Little ones');
  });
  it('skips a full or closed room and says why', () => {
    const full = room({ present: 10 });
    expect(suggestRoom([full], 12)).toBeNull();
    expect(roomProblem(full, 12)).toMatch(/full \(10\/10\)/);
    expect(roomProblem(room({ isActive: false }), 12)).toMatch(/closed/);
    expect(roomProblem(room({}), 60)).toMatch(/ages 0 mo to 3 yr/);
    expect(roomProblem(room({}), 12)).toBeNull();
  });
});
