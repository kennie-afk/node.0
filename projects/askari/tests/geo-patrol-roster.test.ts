import { describe, expect, it } from 'vitest';
import { geofenceResult, haversineMeters, validFix } from '../src/ops/geo';
import { evaluatePatrol } from '../src/ops/patrol';
import { overlaps, rosterConflicts, templateMinutes, weekStartKey } from '../src/ops/roster';

const D = (s: string) => new Date(s);
const NAIROBI = { lat: -1.2921, lng: 36.8219 };

describe('geofence', () => {
  it('measures a known distance: 0.001 degrees of latitude is about 111 m', () => {
    const d = haversineMeters(0, 36, 0.001, 36);
    expect(d).toBeGreaterThan(108);
    expect(d).toBeLessThan(114);
  });
  it('is zero for the same point and symmetric', () => {
    expect(haversineMeters(1, 2, 1, 2)).toBe(0);
    expect(haversineMeters(-1.29, 36.82, -1.30, 36.83)).toBe(haversineMeters(-1.30, 36.83, -1.29, 36.82));
  });
  it('is within when inside the radius', () => {
    expect(geofenceResult({ ...NAIROBI, radiusM: 150 }, { lat: NAIROBI.lat + 0.0005, lng: NAIROBI.lng })).toMatchObject({ geofence: 'within' });
  });
  it('is outside when far beyond radius plus the phone error', () => {
    expect(geofenceResult({ ...NAIROBI, radiusM: 150 }, { lat: NAIROBI.lat + 0.01, lng: NAIROBI.lng, accuracyM: 20 }).geofence).toBe('outside');
  });
  it('is unknown, not outside, when the stated error could explain the distance', () => {
    const r = geofenceResult({ ...NAIROBI, radiusM: 100 }, { lat: NAIROBI.lat + 0.0011, lng: NAIROBI.lng, accuracyM: 80 });
    expect(r.geofence).toBe('unknown');
    expect(r.distanceM).toBeGreaterThan(100);
  });
  it('is unknown without site coordinates, without a fix, or with the (0,0) no-fix value', () => {
    expect(geofenceResult({ lat: null, lng: null, radiusM: 100 }, NAIROBI).geofence).toBe('unknown');
    expect(geofenceResult({ ...NAIROBI, radiusM: 100 }, null).geofence).toBe('unknown');
    expect(geofenceResult({ ...NAIROBI, radiusM: 100 }, { lat: 0, lng: 0 }).geofence).toBe('unknown');
  });
  it('rejects impossible coordinates', () => {
    expect(validFix({ lat: 91, lng: 0 })).toBe(false);
    expect(validFix({ lat: 0, lng: 181 })).toBe(false);
    expect(validFix({ lat: NaN, lng: 0 })).toBe(false);
    expect(validFix({ lat: '1', lng: 0 })).toBe(false);
    expect(validFix({ lat: -1.2, lng: 36.8 })).toBe(true);
  });
});

describe('roster conflicts', () => {
  const night = { start: D('2026-10-05T15:00:00Z'), end: D('2026-10-06T03:00:00Z') };
  it('overlap is half-open: back to back is not an overlap', () => {
    expect(overlaps({ start: D('2026-10-05T06:00:00Z'), end: D('2026-10-05T14:00:00Z') }, { start: D('2026-10-05T14:00:00Z'), end: D('2026-10-05T22:00:00Z') })).toBe(false);
    expect(overlaps({ start: D('2026-10-05T06:00:00Z'), end: D('2026-10-05T14:01:00Z') }, { start: D('2026-10-05T14:00:00Z'), end: D('2026-10-05T22:00:00Z') })).toBe(true);
  });
  it('finds a double booking', () => {
    const c = rosterConflicts({ start: D('2026-10-05T20:00:00Z'), end: D('2026-10-06T04:00:00Z') }, [night], { maxHoursPerWeek: null, minRestHours: null });
    expect(c.map((x) => x.kind)).toEqual(['double_booked']);
  });
  it('enforces no limit by default', () => {
    expect(rosterConflicts({ start: D('2026-10-06T04:00:00Z'), end: D('2026-10-06T16:00:00Z') }, [night], { maxHoursPerWeek: null, minRestHours: null })).toEqual([]);
  });
  it('flags short rest only when the firm set a minimum', () => {
    const next = { start: D('2026-10-06T07:00:00Z'), end: D('2026-10-06T15:00:00Z') };
    expect(rosterConflicts(next, [night], { maxHoursPerWeek: null, minRestHours: 8 }).map((x) => x.kind)).toEqual(['rest_too_short']);
    expect(rosterConflicts(next, [night], { maxHoursPerWeek: null, minRestHours: 4 })).toEqual([]);
  });
  it('rest is measured on either side of the candidate', () => {
    const earlier = { start: D('2026-10-05T03:00:00Z'), end: D('2026-10-05T11:00:00Z') };
    const c = rosterConflicts({ start: D('2026-10-05T15:00:00Z'), end: D('2026-10-05T23:00:00Z') }, [earlier], { maxHoursPerWeek: null, minRestHours: 8 });
    expect(c.map((x) => x.kind)).toEqual(['rest_too_short']);
  });
  it('sums weekly hours within the local week only', () => {
    const six = Array.from({ length: 5 }, (_, i) => ({ start: D(`2026-10-0${5 + i}T03:00:00Z`), end: D(`2026-10-0${5 + i}T15:00:00Z`) })); // Mon-Fri, 12h each
    const extra = { start: D('2026-10-10T03:00:00Z'), end: D('2026-10-10T15:00:00Z') }; // Saturday: 72h total
    expect(rosterConflicts(extra, six, { maxHoursPerWeek: 60, minRestHours: null }).map((x) => x.kind)).toEqual(['weekly_hours_exceeded']);
    expect(rosterConflicts(extra, six, { maxHoursPerWeek: 72, minRestHours: null })).toEqual([]);
    const nextWeek = { start: D('2026-10-12T03:00:00Z'), end: D('2026-10-12T15:00:00Z') };
    expect(rosterConflicts(nextWeek, six, { maxHoursPerWeek: 60, minRestHours: null })).toEqual([]);
  });
  it('finds the Monday of the local week', () => {
    expect(weekStartKey(D('2026-10-03T12:00:00Z'))).toBe('2026-09-28');
    expect(weekStartKey(D('2026-10-04T20:59:00Z'))).toBe('2026-09-28'); // Sunday 23:59 Nairobi
    expect(weekStartKey(D('2026-10-04T21:01:00Z'))).toBe('2026-10-05'); // Monday 00:01 Nairobi
  });
  it('computes shift length across midnight', () => {
    expect(templateMinutes('06:00', '18:00')).toBe(720);
    expect(templateMinutes('18:00:00', '06:00:00')).toBe(720);
    expect(templateMinutes('22:30', '06:15')).toBe(465);
  });
});

describe('patrol rounds', () => {
  const cps = [{ id: 'a', name: 'Gate', seq: 1 }, { id: 'b', name: 'Store', seq: 2 }, { id: 'c', name: 'Fence', seq: 3 }];
  const scan = (id: string, t: string) => ({ checkpointId: id, at: D(`2026-10-05T${t}:00Z`) });
  it('counts a complete round and reports a missed checkpoint in the next', () => {
    const r = evaluatePatrol(cps, [scan('a', '20:00'), scan('b', '20:10'), scan('c', '20:20'), scan('a', '22:00'), scan('b', '22:10')], false, 2);
    expect(r.completeRounds).toBe(1);
    expect(r.rounds[1]).toMatchObject({ complete: false, missed: ['Fence'] });
    expect(r.shortfall).toBe(1);
  });
  it('a repeated checkpoint starts a new round and leaves the first incomplete', () => {
    const r = evaluatePatrol(cps, [scan('a', '20:00'), scan('a', '20:05'), scan('b', '20:10'), scan('c', '20:20')], false, 1);
    expect(r.rounds).toHaveLength(2);
    expect(r.rounds[0]).toMatchObject({ complete: false, missed: ['Store', 'Fence'] });
    expect(r.rounds[1]!.complete).toBe(true);
  });
  it('marks a round out of order only when the site wants an order', () => {
    const scans = [scan('b', '20:00'), scan('a', '20:05'), scan('c', '20:10')];
    expect(evaluatePatrol(cps, scans, true, 1).rounds[0]).toMatchObject({ complete: true, outOfOrder: true });
    expect(evaluatePatrol(cps, scans, false, 1).rounds[0]).toMatchObject({ complete: true, outOfOrder: false });
  });
  it('ignores unknown checkpoints and sorts scans by time', () => {
    const r = evaluatePatrol(cps, [scan('c', '20:20'), scan('zz', '20:01'), scan('a', '20:00'), scan('b', '20:10')], true, 1);
    expect(r.completeRounds).toBe(1);
    expect(r.rounds[0]!.outOfOrder).toBe(false);
  });
  it('no scans: nothing complete and the whole requirement is the shortfall', () => {
    expect(evaluatePatrol(cps, [], false, 3)).toMatchObject({ rounds: [], completeRounds: 0, shortfall: 3 });
  });
  it('a site with no required rounds has no shortfall', () => {
    expect(evaluatePatrol(cps, [], false, 0).shortfall).toBe(0);
  });
});
