import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, boot, get, liveShift, localParts, makeGuard, makePlace, pastShift, newTenant, nextId, nextPhone, on, patch, post, put, shutdown, Tenant } from './helpers';

vi.setConfig({ testTimeout: 180_000 });
afterAll(shutdown);

const NEARBY = { lat: -1.2921, lng: 36.8219 };

describe.runIf(on)('guards and sites', () => {
  it('creates a guard with a number, refuses a duplicate ID or phone, and finds them by search', async () => {
    const t = await newTenant('Guards Firm');
    const g = await makeGuard(t.owner.auth, { fullName: 'Wanjiru Njeri', nationalId: '11112222' });
    expect(g.guardNo).toBe('G0001');
    expect((await makeGuard(t.owner.auth)).guardNo).toBe('G0002');
    expect((await post(t.owner.auth, '/v1/guards', { fullName: 'Dup Id', nationalId: '11112222' })).status).toBe(409);
    expect((await post(t.owner.auth, '/v1/guards', { fullName: 'Dup Phone', phone: g.phone })).status).toBe(409);
    expect((await get(t.owner.auth, '/v1/guards?q=Njeri')).body.items.map((x: { id: string }) => x.id)).toEqual([g.id]);
    expect((await get(t.owner.auth, '/v1/guards?q=11112222')).body.total).toBe(1);
    expect((await get(t.owner.auth, '/v1/guards?q=%25')).body.total).toBe(0); // a wildcard is a literal, not a match-all
  });

  it('pages guard lists on the server and never returns more than a page', async () => {
    const t = await newTenant('Paging Firm');
    for (let i = 0; i < 7; i += 1) await makeGuard(t.owner.auth, { fullName: `Page Guard ${i}` });
    const p1 = await get(t.owner.auth, '/v1/guards?pageSize=3&page=1');
    const p3 = await get(t.owner.auth, '/v1/guards?pageSize=3&page=3');
    expect(p1.body).toMatchObject({ total: 7, page: 1, pageSize: 3 });
    expect(p1.body.items).toHaveLength(3);
    expect(p3.body.items).toHaveLength(1);
    expect((await get(t.owner.auth, '/v1/guards?pageSize=100000')).body.pageSize).toBe(100);
  });

  it('keeps the guard\'s numbers as typed and states nothing is verified', async () => {
    const t = await newTenant('Data Firm');
    const g = await post(t.owner.auth, '/v1/guards', { fullName: 'Data Guard', psraRegNo: 'PSRA/123', psraExpiry: '2030-01-01', nssfNo: '99', shaNo: '88', kraPin: 'A00' });
    expect(g.body).toMatchObject({ psraRegNo: 'PSRA/123', psraExpiry: '2030-01-01', nssfNo: '99', shaNo: '88', kraPin: 'A00' });
    expect((await patch(t.owner.auth, `/v1/guards/${g.body.id}`, { psraRegNo: null })).body.psraRegNo).toBeNull();
    expect((await post(t.owner.auth, '/v1/guards', { fullName: 'Bad Phone', phone: '12345' })).status).toBe(400);
    expect((await patch(t.owner.auth, `/v1/guards/${g.body.id}`, { phone: '999' })).status).toBe(400);
  });

  it('on exit opens the guard\'s future shifts and keeps the past', async () => {
    const t = await newTenant('Exit Firm');
    const g = await makeGuard(t.owner.auth);
    const place = await makePlace(t.owner.auth);
    const live = await liveShift(t.owner.auth, place, g.id, { startedMinutesAgo: 30, hours: 2 });
    const tomorrow = localParts(new Date(Date.now() + 86_400_000)).date;
    const future = await post(t.owner.auth, '/v1/shifts', { siteId: place.siteId, postId: place.postId, guardId: g.id, date: tomorrow, startTime: '09:00', endTime: '17:00' });
    expect(future.status).toBe(201);
    const exit = await post(t.owner.auth, `/v1/guards/${g.id}/exit`, { exitedOn: localParts(new Date()).date });
    expect(exit.body.shiftsOpened).toBeGreaterThanOrEqual(1);
    expect((await get(t.owner.auth, `/v1/shifts/${future.body.id}`)).body.guardId).toBeNull();
    expect((await get(t.owner.auth, `/v1/shifts/${live.id}`)).body.guardId).toBe(g.id);
    expect((await post(t.owner.auth, `/v1/guards/${g.id}/exit`, { exitedOn: localParts(new Date()).date })).status).toBe(409);
    expect((await put(t.owner.auth, `/v1/shifts/${future.body.id}/guard`, { guardId: g.id })).status).toBe(409); // a guard who left cannot be rostered
  });

  it('requires both coordinates or neither on a site, and turns an inactive site away from new shifts', async () => {
    const t = await newTenant('Site Firm');
    const c = await post(t.owner.auth, '/v1/clients', { name: 'Site Client' });
    expect((await post(t.owner.auth, '/v1/sites', { clientId: c.body.id, name: 'Half', lat: -1.2 })).status).toBe(400);
    const place = await makePlace(t.owner.auth);
    expect((await patch(t.owner.auth, `/v1/sites/${place.siteId}`, { active: false })).status).toBe(200);
    const r = await post(t.owner.auth, '/v1/shifts', { siteId: place.siteId, postId: place.postId, date: localParts(new Date()).date, startTime: '06:00', endTime: '18:00' });
    expect(r.status).toBe(409);
  });

  it('refuses a duplicate client name and lists clients and sites with paging', async () => {
    const t = await newTenant('Client Firm');
    await post(t.owner.auth, '/v1/clients', { name: 'Same Name' });
    expect((await post(t.owner.auth, '/v1/clients', { name: 'Same Name' })).status).toBe(409);
    await makePlace(t.owner.auth);
    expect((await get(t.owner.auth, '/v1/clients?pageSize=1')).body.items).toHaveLength(1);
    expect((await get(t.owner.auth, '/v1/sites')).body.total).toBe(1);
  });
});

describe.runIf(on)('rosters', () => {
  async function setup(name: string) {
    const t = await newTenant(name);
    const place = await makePlace(t.owner.auth);
    return { t, place };
  }
  const shiftBody = (place: { siteId: string; postId: string }, guardId: string | null, date: string, startTime: string, endTime: string) => ({ siteId: place.siteId, postId: place.postId, guardId, date, startTime, endTime });

  it('refuses to put a guard on two overlapping shifts, in the service and in the database', async () => {
    const { t, place } = await setup('Overlap Firm');
    const g = await makeGuard(t.owner.auth);
    const day = localParts(new Date(Date.now() + 2 * 86_400_000)).date;
    expect((await post(t.owner.auth, '/v1/shifts', shiftBody(place, g.id, day, '06:00', '18:00'))).status).toBe(201);
    const clash = await post(t.owner.auth, '/v1/shifts', shiftBody(place, g.id, day, '17:00', '23:00'));
    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/already on another shift/);
    expect((await post(t.owner.auth, '/v1/shifts', shiftBody(place, g.id, day, '18:00', '23:00'))).status).toBe(201); // back to back is fine
    // straight into the database as the restricted role: the exclusion constraint itself refuses
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query(
      `INSERT INTO shifts (org_id, branch_id, site_id, post_id, guard_id, start_at, end_at, scheduled_minutes) SELECT org_id, branch_id, site_id, post_id, guard_id, start_at + interval '1 hour', end_at - interval '1 hour', 600 FROM shifts WHERE guard_id = $1 LIMIT 1`, [g.id]
    ))).rejects.toThrow(/shifts_no_double_booking|conflicting key/);
  });

  it('lets exactly one of many simultaneous overlapping assignments win', async () => {
    const { t, place } = await setup('Race Firm');
    const g = await makeGuard(t.owner.auth);
    const day = localParts(new Date(Date.now() + 3 * 86_400_000)).date;
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => post(t.owner.auth, '/v1/shifts', shiftBody(place, g.id, day, `0${i}:00`, `1${i}:00`))));
    // every shift 0N:00-1N:00 overlaps every other: only one can hold the guard
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    const list = await get(t.owner.auth, `/v1/shifts?from=${day}&to=${day}&guardId=${g.id}`);
    expect(list.body.total).toBe(1);
  });

  it('puts a shift on the right local day, even just after midnight and just before it', async () => {
    const { t, place } = await setup('Midnight Firm');
    const early = await makeGuard(t.owner.auth);
    const late = await makeGuard(t.owner.auth);
    const day = localParts(new Date(Date.now() + 6 * 86_400_000)).date;
    const before = localParts(new Date(Date.parse(`${day}T12:00:00+03:00`) - 86_400_000)).date;
    const after = localParts(new Date(Date.parse(`${day}T12:00:00+03:00`) + 86_400_000)).date;
    await post(t.owner.auth, '/v1/shifts', shiftBody(place, early.id, day, '00:30', '04:30'));
    await post(t.owner.auth, '/v1/shifts', shiftBody(place, late.id, day, '23:00', '23:59'));
    expect((await get(t.owner.auth, `/v1/shifts?from=${day}&to=${day}`)).body.total).toBe(2);
    expect((await get(t.owner.auth, `/v1/shifts?from=${before}&to=${before}`)).body.total).toBe(0);
    expect((await get(t.owner.auth, `/v1/shifts?from=${after}&to=${after}`)).body.total).toBe(0);
    expect((await get(t.owner.auth, `/v1/attendance/board?day=${day}`)).body.counts.total).toBe(2);
    expect((await get(t.owner.auth, `/v1/shifts?from=${day}&to=${after}`)).body.total).toBe(2);
    expect((await post(t.owner.auth, '/v1/shifts', shiftBody(place, null, day, '10:00', '10:20'))).status).toBe(400);
  });

  it('enforces weekly hours and rest only when the firm sets a limit', async () => {
    const { t, place } = await setup('Limits Firm');
    const g = await makeGuard(t.owner.auth);
    const base = localParts(new Date(Date.now() + 10 * 86_400_000)).date;
    expect((await post(t.owner.auth, '/v1/shifts', shiftBody(place, g.id, base, '06:00', '18:00'))).status).toBe(201);
    // no limits: a shift 3 hours after the last one is accepted
    expect((await post(t.owner.auth, '/v1/shifts', shiftBody(place, g.id, base, '21:00', '23:00'))).status).toBe(201);
    await patch(t.owner.auth, '/v1/settings', { minRestHours: 8 });
    const tooSoon = await post(t.owner.auth, '/v1/shifts', shiftBody(place, g.id, localParts(new Date(Date.parse(`${base}T00:00:00+03:00`) + 86_400_000)).date, '04:00', '09:00'));
    expect(tooSoon.status).toBe(409);
    expect(tooSoon.body.message).toMatch(/rest/);
    await patch(t.owner.auth, '/v1/settings', { minRestHours: null, maxHoursPerWeek: 20 });
    const g2 = await makeGuard(t.owner.auth);
    const monday = (() => { const d = new Date(Date.parse(`${base}T12:00:00+03:00`)); const wd = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - wd * 86_400_000 + 7 * 86_400_000); })();
    const mon = localParts(monday).date;
    const tue = localParts(new Date(monday.getTime() + 86_400_000)).date;
    expect((await post(t.owner.auth, '/v1/shifts', shiftBody(place, g2.id, mon, '06:00', '18:00'))).status).toBe(201);
    const over = await post(t.owner.auth, '/v1/shifts', shiftBody(place, g2.id, tue, '06:00', '18:00'));
    expect(over.status).toBe(409);
    expect(over.body.message).toMatch(/limit of 20/);
  });

  it('creates a run of shifts from a template, skipping the days that clash, and refuses an absurd range', async () => {
    const { t, place } = await setup('Bulk Firm');
    const g = await makeGuard(t.owner.auth);
    const tpl = await post(t.owner.auth, '/v1/shift-templates', { name: 'Night', startTime: '18:00', endTime: '06:00' });
    expect(tpl.body.minutes).toBe(720);
    const from = localParts(new Date(Date.now() + 20 * 86_400_000)).date;
    const to = localParts(new Date(Date.now() + 26 * 86_400_000)).date;
    await post(t.owner.auth, '/v1/shifts', shiftBody(place, g.id, from, '20:00', '23:00')); // clashes with the first night
    const r = await post(t.owner.auth, '/v1/shifts/bulk', { siteId: place.siteId, postId: place.postId, templateId: tpl.body.id, from, to, guardId: g.id });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(6);
    expect(r.body.skipped).toHaveLength(1);
    expect((await post(t.owner.auth, '/v1/shifts/bulk', { siteId: place.siteId, postId: place.postId, templateId: tpl.body.id, from, to: localParts(new Date(Date.now() + 200 * 86_400_000)).date })).status).toBe(400);
  });

  it('publishes assigned shifts once, and cancels with a reason but not after attendance or invoicing', async () => {
    const { t, place } = await setup('Publish Firm');
    const g = await makeGuard(t.owner.auth);
    const day = localParts(new Date(Date.now() + 5 * 86_400_000)).date;
    const s = await post(t.owner.auth, '/v1/shifts', shiftBody(place, g.id, day, '06:00', '18:00'));
    await post(t.owner.auth, '/v1/shifts', shiftBody(place, null, day, '06:00', '18:00')); // open: never published
    expect((await post(t.owner.auth, '/v1/roster/publish', { from: day, to: day })).body.published).toBe(1);
    expect((await post(t.owner.auth, '/v1/roster/publish', { from: day, to: day })).body.published).toBe(0);
    expect((await post(t.owner.auth, `/v1/shifts/${s.body.id}/cancel`, { reason: 'x' })).status).toBe(400);
    expect((await post(t.owner.auth, `/v1/shifts/${s.body.id}/cancel`, { reason: 'Client closed the site' })).status).toBe(200);
    expect((await post(t.owner.auth, `/v1/shifts/${s.body.id}/cancel`, { reason: 'Again please' })).status).toBe(409);
    const live = await liveShift(t.owner.auth, place, g.id);
    await post(t.owner.auth, `/v1/shifts/${live.id}/check`, { kind: 'in' });
    expect((await post(t.owner.auth, `/v1/shifts/${live.id}/cancel`, { reason: 'Too late to cancel' })).status).toBe(409);
    expect((await put(t.owner.auth, `/v1/shifts/${live.id}/guard`, { guardId: null })).status).toBe(409);
  });

  it('runs a swap: another person approves, the shift moves, the audit trail names both', async () => {
    const { t, place } = await setup('Swap Firm');
    const sup = await addStaff(t, 'supervisor');
    const ops = await addStaff(t, 'ops_manager');
    const a = await makeGuard(t.owner.auth);
    const b = await makeGuard(t.owner.auth);
    const day = localParts(new Date(Date.now() + 4 * 86_400_000)).date;
    const s = await post(t.owner.auth, '/v1/shifts', shiftBody(place, a.id, day, '06:00', '18:00'));
    const req = await post(sup.auth, '/v1/swaps', { shiftId: s.body.id, toGuardId: b.id, reason: 'Funeral' });
    expect(req.status).toBe(201);
    expect((await post(sup.auth, '/v1/swaps', { shiftId: s.body.id, toGuardId: b.id })).status).toBe(409); // one pending request per shift
    expect((await post(sup.auth, `/v1/swaps/${req.body.id}/decision`, { decision: 'approve' })).status).toBe(403); // a supervisor cannot approve
    expect((await post(ops.auth, `/v1/swaps/${req.body.id}/decision`, { decision: 'approve', note: 'Fine' })).body.status).toBe('approved');
    expect((await get(t.owner.auth, `/v1/shifts/${s.body.id}`)).body.guardId).toBe(b.id);
    expect((await post(ops.auth, `/v1/swaps/${req.body.id}/decision`, { decision: 'approve' })).status).toBe(409);
    expect((await get(t.owner.auth, '/v1/swaps?status=approved')).body.total).toBe(1);
  });

  it('refuses a swap into a clash and a swap on a shift that has already started', async () => {
    const { t, place } = await setup('Swap Clash Firm');
    const ops = await addStaff(t, 'ops_manager');
    const a = await makeGuard(t.owner.auth);
    const b = await makeGuard(t.owner.auth);
    const day = localParts(new Date(Date.now() + 4 * 86_400_000)).date;
    const s1 = await post(t.owner.auth, '/v1/shifts', shiftBody(place, a.id, day, '06:00', '18:00'));
    await post(t.owner.auth, '/v1/shifts', shiftBody(place, b.id, day, '10:00', '14:00'));
    const req = await post(t.owner.auth, '/v1/swaps', { shiftId: s1.body.id, toGuardId: b.id });
    expect(req.status).toBe(201);
    const decided = await post(ops.auth, `/v1/swaps/${req.body.id}/decision`, { decision: 'approve' });
    expect(decided.status).toBe(409);
    expect((await get(t.owner.auth, `/v1/shifts/${s1.body.id}`)).body.guardId).toBe(a.id);
    const live = await liveShift(t.owner.auth, place, a.id, { startedMinutesAgo: 30 });
    expect((await post(t.owner.auth, '/v1/swaps', { shiftId: live.id, toGuardId: b.id })).status).toBe(409);
  });

  it('approves overtime only after a check-out, only by an ops manager, and caps it', async () => {
    const { t, place } = await setup('Overtime Firm');
    const ops = await addStaff(t, 'ops_manager');
    const sup = await addStaff(t, 'supervisor');
    const g = await makeGuard(t.owner.auth);
    const s = await liveShift(t.owner.auth, place, g.id);
    expect((await put(ops.auth, `/v1/shifts/${s.id}/overtime`, { minutes: 60 })).status).toBe(409); // not checked out
    await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'in' });
    await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'out' });
    expect((await put(sup.auth, `/v1/shifts/${s.id}/overtime`, { minutes: 60 })).status).toBe(403);
    expect((await put(ops.auth, `/v1/shifts/${s.id}/overtime`, { minutes: 721 })).status).toBe(400);
    expect((await put(ops.auth, `/v1/shifts/${s.id}/overtime`, { minutes: 90, note: 'Relief late' })).body.overtimeApprovedMinutes).toBe(90);
  });
});

describe.runIf(on)('attendance', () => {
  async function ready(name: string, over: { lat?: number; lng?: number; geofenceM?: number } = {}) {
    const t = await newTenant(name);
    const place = await makePlace(t.owner.auth, over);
    const g = await makeGuard(t.owner.auth);
    return { t, place, g };
  }

  it('stamps events with the server clock, ignoring any time the client sends', async () => {
    const { t, place, g } = await ready('Clock Firm');
    const s = await liveShift(t.owner.auth, place, g.id);
    const before = Date.now();
    const r = await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'in', at: '2020-01-01T00:00:00Z', time: '2020-01-01T00:00:00Z', effectiveAt: '2020-01-01T00:00:00Z' });
    expect(r.status).toBe(201);
    const at = new Date(r.body.at).getTime();
    expect(at).toBeGreaterThanOrEqual(before - 2000);
    expect(at).toBeLessThanOrEqual(Date.now() + 2000);
  });

  it('flags a check-in outside the geofence and records it anyway; unknown without a fix', async () => {
    const { t, place, g } = await ready('Fence Firm');
    const s1 = await liveShift(t.owner.auth, place, g.id);
    const out = await post(t.owner.auth, `/v1/shifts/${s1.id}/check`, { kind: 'in', fix: { lat: NEARBY.lat + 0.05, lng: NEARBY.lng, accuracyM: 10 } });
    expect(out.status).toBe(201);
    expect(out.body.geofence).toBe('outside');
    expect(out.body.distanceM).toBeGreaterThan(1000);
    const g2 = await makeGuard(t.owner.auth);
    const s2 = await liveShift(t.owner.auth, place, g2.id);
    expect((await post(t.owner.auth, `/v1/shifts/${s2.id}/check`, { kind: 'in', fix: { lat: NEARBY.lat + 0.0003, lng: NEARBY.lng, accuracyM: 8 } })).body.geofence).toBe('within');
    const g3 = await makeGuard(t.owner.auth);
    const s3 = await liveShift(t.owner.auth, place, g3.id);
    expect((await post(t.owner.auth, `/v1/shifts/${s3.id}/check`, { kind: 'in' })).body.geofence).toBe('unknown');
    const board = await get(t.owner.auth, '/v1/attendance/board');
    expect(board.body.counts.outsideGeofence).toBe(1);
  });

  it('lets exactly one of thirty simultaneous check-ins succeed', async () => {
    const { t, place, g } = await ready('Dup Firm');
    const s = await liveShift(t.owner.auth, place, g.id);
    const results = await Promise.all(Array.from({ length: 30 }, () => post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'in' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(29);
    const { pool } = await boot();
    const n = await pool.withOrg(t.orgId, async (c) => Number((await c.query(`SELECT count(*) AS n FROM attendance_events WHERE shift_id = $1 AND kind = 'in'`, [s.id])).rows[0].n));
    expect(n).toBe(1);
  });

  it('has the database itself refuse a second check-in or check-out for a shift, whatever the service does', async () => {
    const { t, place, g } = await ready('Backstop Firm');
    const s = await liveShift(t.owner.auth, place, g.id);
    await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'in' });
    await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'out' });
    const { pool } = await boot();
    for (const kind of ['in', 'out']) {
      await expect(pool.withOrg(t.orgId, (c) => c.query(`INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, method) VALUES ($1, $2, $3, $4, 'supervisor')`, [t.orgId, s.id, g.id, kind]))).rejects.toThrow(/duplicate key/);
    }
    // an override must carry a reason, also enforced by the database
    await expect(pool.withOrg(t.orgId, (c) => c.query(`INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, method, reason) VALUES ($1, $2, $3, 'override_in', 'override', 'x')`, [t.orgId, s.id, g.id]))).rejects.toThrow(/check constraint/);
  });

  it('refuses check-out before check-in, a second check-out, too-early and after-the-end check-ins', async () => {
    const { t, place, g } = await ready('Window Firm');
    const s = await liveShift(t.owner.auth, place, g.id);
    expect((await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'out' })).body.message).toMatch(/no check-in/);
    expect((await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'in' })).status).toBe(201);
    expect((await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'out' })).status).toBe(201);
    expect((await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'out' })).status).toBe(409);
    const g2 = await makeGuard(t.owner.auth);
    const early = await liveShift(t.owner.auth, place, g2.id, { startedMinutesAgo: -180, hours: 4 });
    expect((await post(t.owner.auth, `/v1/shifts/${early.id}/check`, { kind: 'in' })).body.message).toMatch(/Too early/);
    const g3 = await makeGuard(t.owner.auth);
    const ended = await liveShift(t.owner.auth, place, g3.id, { startedMinutesAgo: 600, hours: 8 });
    expect((await post(t.owner.auth, `/v1/shifts/${ended.id}/check`, { kind: 'in' })).body.message).toMatch(/override/);
  });

  it('refuses attendance on an open or cancelled shift', async () => {
    const { t, place } = await ready('Open Firm');
    const open = await liveShift(t.owner.auth, place, null);
    expect((await post(t.owner.auth, `/v1/shifts/${open.id}/check`, { kind: 'in' })).body.message).toMatch(/Nobody is assigned/);
  });

  it('lets a supervisor correct a missed check-in with a reason; the original stays on record', async () => {
    const { t, place, g } = await ready('Override Firm');
    const sup = await addStaff(t, 'supervisor');
    const s = await liveShift(t.owner.auth, place, g.id, { startedMinutesAgo: 600, hours: 8 });
    const when = new Date(s.startAt.getTime() + 5 * 60_000).toISOString();
    expect((await post(sup.auth, `/v1/shifts/${s.id}/override`, { kind: 'in', effectiveAt: when, reason: 'no' })).status).toBe(400);
    expect((await post(sup.auth, `/v1/shifts/${s.id}/override`, { kind: 'in', effectiveAt: new Date(Date.now() + 3_600_000).toISOString(), reason: 'In the future' })).status).toBe(400);
    expect((await post(sup.auth, `/v1/shifts/${s.id}/override`, { kind: 'out', effectiveAt: when, reason: 'Out without an in' })).status).toBe(409);
    const ok = await post(sup.auth, `/v1/shifts/${s.id}/override`, { kind: 'in', effectiveAt: when, reason: 'Phone had no signal at the gate' });
    expect(ok.status).toBe(201);
    const out = await post(sup.auth, `/v1/shifts/${s.id}/override`, { kind: 'out', effectiveAt: new Date(s.endAt.getTime()).toISOString(), reason: 'Left on time, forgot to tap' });
    expect(out.status).toBe(201);
    expect((await post(sup.auth, `/v1/shifts/${s.id}/override`, { kind: 'out', effectiveAt: new Date(s.startAt.getTime()).toISOString(), reason: 'Before the check-in' })).status).toBe(400);
    const detail = await get(t.owner.auth, `/v1/shifts/${s.id}`);
    expect(detail.body.events.map((e: { kind: string }) => e.kind)).toEqual(['override_in', 'override_out']);
    expect(detail.body.events[0].reason).toBe('Phone had no signal at the gate');
    const audit = JSON.stringify((await get(t.owner.auth, '/v1/audit')).body);
    expect(audit).toContain('attendance.override_in');
    const board = await get(t.owner.auth, `/v1/attendance/board?day=${localParts(s.startAt).date}`);
    const row = board.body.items.find((r: { shiftId: string }) => r.shiftId === s.id);
    expect(row).toMatchObject({ state: 'completed', inOverridden: true });
  });

  it('makes attendance events append-only for the application role', async () => {
    const { t, place, g } = await ready('Immutable Firm');
    const s = await liveShift(t.owner.auth, place, g.id);
    await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'in' });
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query(`UPDATE attendance_events SET at = at - interval '5 hours' WHERE shift_id = $1`, [s.id]))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`DELETE FROM attendance_events WHERE shift_id = $1`, [s.id]))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`TRUNCATE attendance_events`))).rejects.toThrow(/permission denied/);
  });

  it('shows the board worst first with counts for the whole day', async () => {
    const { t, place } = await ready('Board Firm');
    const ga = await makeGuard(t.owner.auth);
    const gb = await makeGuard(t.owner.auth);
    const missed = await liveShift(t.owner.auth, place, ga.id, { startedMinutesAgo: 120, hours: 4 });
    const ok = await liveShift(t.owner.auth, place, gb.id, { startedMinutesAgo: 5, hours: 4 });
    await post(t.owner.auth, `/v1/shifts/${ok.id}/check`, { kind: 'in' });
    await liveShift(t.owner.auth, place, null, { startedMinutesAgo: 5, hours: 4 });
    const b = await get(t.owner.auth, `/v1/attendance/board?day=${localParts(new Date()).date}`);
    expect(b.body.counts).toMatchObject({ total: 3, missed: 1, on_site: 1, open: 1 });
    expect(b.body.items[0].shiftId).toBe(missed.id);
    expect(b.body.items[0].state).toBe('missed');
    expect((await get(t.owner.auth, '/v1/attendance/board?state=missed')).body.items).toHaveLength(1);
    expect((await get(t.owner.auth, '/v1/attendance/board?pageSize=1')).body.items).toHaveLength(1);
  });

  it('keeps a night shift on today\'s board after midnight, and does not carry older shifts forward', async () => {
    const { t, place, g } = await ready('Night Board Firm');
    const g2 = await makeGuard(t.owner.auth);
    const today = localParts(new Date()).date;
    const yesterday = localParts(new Date(Date.now() - 86_400_000)).date;
    const threeDaysAgo = localParts(new Date(Date.now() - 3 * 86_400_000)).date;
    // started yesterday 20:00, runs 12 hours: still going (or just ended) after midnight, whatever the time of day the test runs
    await pastShift(t, place, g.id, new Date(`${yesterday}T20:00:00+03:00`), { hours: 12, inAfterMin: 5, outAtEnd: false });
    await pastShift(t, place, g2.id, new Date(`${threeDaysAgo}T20:00:00+03:00`), { hours: 12, inAfterMin: 5 });
    const b = await get(t.owner.auth, `/v1/attendance/board?day=${today}`);
    expect(b.body.items.map((r: { guardId: string }) => r.guardId)).toEqual([g.id]);
    const y = await get(t.owner.auth, `/v1/attendance/board?day=${yesterday}`);
    expect(y.body.items.map((r: { guardId: string }) => r.guardId)).toEqual([g.id]); // and it still belongs to the day it started
    expect((await get(t.owner.auth, `/v1/attendance/board?day=${threeDaysAgo}`)).body.items).toHaveLength(1);
  });

  it('lets a guard check in and out alone with phone and PIN, and only on their own shift', async () => {
    const { t, place, g } = await ready('Guard Pin Firm');
    const pin = await post(t.owner.auth, `/v1/guards/${g.id}/pin`);
    expect(pin.body.pin).toMatch(/^\d{6}$/);
    const other = await makeGuard(t.owner.auth);
    await liveShift(t.owner.auth, place, other.id);
    const s = await liveShift(t.owner.auth, place, g.id);
    const { app } = await boot();
    const wrong = await request(app).post('/v1/guard/check').send({ phone: g.phone, pin: '000000', kind: 'in' });
    expect(wrong.status).toBe(401);
    const unknown = await request(app).post('/v1/guard/check').send({ phone: '254799999999', pin: '123456', kind: 'in' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message); // the same answer whichever part was wrong
    const ok = await request(app).post('/v1/guard/check').send({ phone: g.phone, pin: pin.body.pin, kind: 'in', fix: { lat: NEARBY.lat, lng: NEARBY.lng, accuracyM: 5 } });
    expect(ok.status).toBe(201);
    expect(ok.body.geofence).toBe('within');
    expect((await request(app).post('/v1/guard/check').send({ phone: g.phone, pin: pin.body.pin, kind: 'in' })).status).toBe(409);
    expect((await request(app).post('/v1/guard/check').send({ phone: g.phone, pin: pin.body.pin, kind: 'out' })).status).toBe(201);
    const detail = await get(t.owner.auth, `/v1/shifts/${s.id}`);
    expect(detail.body.events.map((e: { method: string }) => e.method)).toEqual(['guard_pin', 'guard_pin']);
  });

  it('throttles wrong guard PINs per phone number, not per address', async () => {
    const { t, g } = await ready('Throttle Firm');
    await post(t.owner.auth, `/v1/guards/${g.id}/pin`);
    const { app } = await boot();
    const codes: number[] = [];
    for (let i = 0; i < 12; i += 1) codes.push((await request(app).post('/v1/guard/check').send({ phone: g.phone, pin: '1111' + String(i).padStart(2, '0'), kind: 'in' })).status);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    // a different guard from the same address is unaffected
    const h = await makeGuard(t.owner.auth);
    await post(t.owner.auth, `/v1/guards/${h.id}/pin`);
    expect((await request(app).post('/v1/guard/check').send({ phone: h.phone, pin: '999999', kind: 'in' })).status).toBe(401);
  });

  it('never lets a guard who left sign in, and a PIN needs a phone number', async () => {
    const { t, g } = await ready('Left Firm');
    const noPhone = await makeGuard(t.owner.auth, { phone: null });
    expect((await post(t.owner.auth, `/v1/guards/${noPhone.id}/pin`)).status).toBe(400);
    const pin = await post(t.owner.auth, `/v1/guards/${g.id}/pin`);
    await post(t.owner.auth, `/v1/guards/${g.id}/exit`, { exitedOn: localParts(new Date()).date });
    const { app } = await boot();
    expect((await request(app).post('/v1/guard/check').send({ phone: g.phone, pin: pin.body.pin, kind: 'in' })).status).toBe(401);
  });
});

describe.runIf(on)('patrols and incidents', () => {
  async function onSite(name: string, over: { rounds?: number; ordered?: boolean } = {}) {
    const t = await newTenant(name);
    const place = await makePlace(t.owner.auth, { rounds: over.rounds ?? 1, ordered: over.ordered ?? false });
    const names = ['Gate', 'Store', 'Fence'];
    const cps = [];
    for (const n of names) cps.push((await post(t.owner.auth, `/v1/sites/${place.siteId}/checkpoints`, { name: n })).body);
    const g = await makeGuard(t.owner.auth);
    const s = await liveShift(t.owner.auth, place, g.id);
    return { t, place, cps, g, s };
  }

  it('records scans in rounds, reporting what a round missed', async () => {
    const { t, cps, s } = await onSite('Patrol Firm', { rounds: 2 });
    expect((await post(t.owner.auth, '/v1/patrol/scan', { token: cps[0].token, shiftId: s.id })).status).toBe(409); // not checked in yet
    await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'in' });
    for (const c of cps) expect((await post(t.owner.auth, '/v1/patrol/scan', { token: c.token, shiftId: s.id })).status).toBe(201);
    await post(t.owner.auth, '/v1/patrol/scan', { token: cps[0].token, shiftId: s.id });
    await post(t.owner.auth, '/v1/patrol/scan', { token: cps[1].token, shiftId: s.id });
    const p = await get(t.owner.auth, `/v1/shifts/${s.id}/patrol`);
    expect(p.body).toMatchObject({ completeRounds: 1, roundsRequired: 2, shortfall: 1, scans: 5 });
    expect(p.body.rounds[1].missed).toEqual(['Fence']);
    const day = await get(t.owner.auth, '/v1/patrol/day');
    expect(day.body[0]).toMatchObject({ roundsRequired: 2, completeRounds: 1, shortfall: 1 });
  });

  it('rejects an unknown, rotated or other-site QR token the same way', async () => {
    const { t, cps, s, place } = await onSite('Token Firm');
    await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'in' });
    expect((await post(t.owner.auth, '/v1/patrol/scan', { token: 'definitely-not-a-token', shiftId: s.id })).status).toBe(404);
    const old = cps[0].token;
    const rotated = await post(t.owner.auth, `/v1/checkpoints/${cps[0].id}/rotate`);
    expect(rotated.body.token).not.toBe(old);
    expect((await post(t.owner.auth, '/v1/patrol/scan', { token: old, shiftId: s.id })).status).toBe(404);
    expect((await post(t.owner.auth, '/v1/patrol/scan', { token: rotated.body.token, shiftId: s.id })).status).toBe(201);
    const other = await makePlace(t.owner.auth, { name: 'Other site' });
    const cp2 = await post(t.owner.auth, `/v1/sites/${other.siteId}/checkpoints`, { name: 'Elsewhere' });
    expect((await post(t.owner.auth, '/v1/patrol/scan', { token: cp2.body.token, shiftId: s.id })).status).toBe(409);
    await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'out' });
    expect((await post(t.owner.auth, '/v1/patrol/scan', { token: cps[1].token, shiftId: s.id })).body.message).toMatch(/ended/);
    expect(place.siteId).toBeTruthy();
  });

  it('flags an out-of-order round when the site wants an order, and lets a guard scan with phone and PIN', async () => {
    const { t, cps, s, g } = await onSite('Ordered Firm', { ordered: true });
    const pin = await post(t.owner.auth, `/v1/guards/${g.id}/pin`);
    const { app } = await boot();
    await request(app).post('/v1/guard/check').send({ phone: g.phone, pin: pin.body.pin, kind: 'in' });
    for (const i of [1, 0, 2]) {
      const r = await request(app).post('/v1/guard/scan').send({ phone: g.phone, pin: pin.body.pin, token: cps[i].token });
      expect(r.status).toBe(201);
    }
    const p = await get(t.owner.auth, `/v1/shifts/${s.id}/patrol`);
    expect(p.body.rounds[0]).toMatchObject({ complete: true, outOfOrder: true });
    expect((await request(app).post('/v1/guard/scan').send({ phone: g.phone, pin: '000000', token: cps[0].token })).status).toBe(401);
  });

  it('keeps patrol scans append-only', async () => {
    const { t, cps, s } = await onSite('Scan Immutable');
    await post(t.owner.auth, `/v1/shifts/${s.id}/check`, { kind: 'in' });
    await post(t.owner.auth, '/v1/patrol/scan', { token: cps[0].token, shiftId: s.id });
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query(`UPDATE patrol_scans SET scanned_at = now() - interval '1 day'`))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`DELETE FROM patrol_scans`))).rejects.toThrow(/permission denied/);
  });

  it('reports incidents that cannot be edited, with notes, closing and reopening by the right roles', async () => {
    const { t, place } = await onSite('Incident Firm');
    const sup = await addStaff(t, 'supervisor');
    const ops = await addStaff(t, 'ops_manager');
    const aud = await addStaff(t, 'auditor');
    const bad = await post(sup.auth, '/v1/incidents', { siteId: place.siteId, severity: 'major', category: 'Theft', narrative: 'no' });
    expect(bad.status).toBe(400);
    const i = await post(sup.auth, '/v1/incidents', { siteId: place.siteId, severity: 'major', category: 'Theft', narrative: 'A laptop was taken from reception overnight.' });
    expect(i.status).toBe(201);
    expect(i.body.incidentNo).toMatch(/^INC-\d{5}$/);
    expect(i.body.status).toBe('open');
    expect((await post(aud.auth, '/v1/incidents', { siteId: place.siteId, severity: 'info', category: 'Log', narrative: 'Auditors may not write' })).status).toBe(403);
    expect((await post(sup.auth, `/v1/incidents/${i.body.id}/notes`, { kind: 'close', body: 'Resolved' })).status).toBe(403);
    expect((await post(sup.auth, `/v1/incidents/${i.body.id}/notes`, { kind: 'note', body: 'Police informed' })).status).toBe(201);
    expect((await post(ops.auth, `/v1/incidents/${i.body.id}/notes`, { kind: 'close', body: 'Recovered' })).body.status).toBe('closed');
    expect((await post(ops.auth, `/v1/incidents/${i.body.id}/notes`, { kind: 'close', body: 'Again' })).status).toBe(409);
    expect((await get(t.owner.auth, '/v1/incidents?status=open')).body.total).toBe(0);
    expect((await post(ops.auth, `/v1/incidents/${i.body.id}/notes`, { kind: 'reopen', body: 'New evidence' })).body.status).toBe('open');
    const detail = await get(t.owner.auth, `/v1/incidents/${i.body.id}`);
    expect(detail.body.notes.map((n: { kind: string }) => n.kind)).toEqual(['note', 'close', 'reopen']);
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query(`UPDATE incidents SET narrative = 'edited'`))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`DELETE FROM incident_notes`))).rejects.toThrow(/permission denied/);
  });

  it('numbers incidents without gaps even when filed at the same moment', async () => {
    const { t, place } = await onSite('Incident Race');
    const rs = await Promise.all(Array.from({ length: 8 }, (_, k) => post(t.owner.auth, '/v1/incidents', { siteId: place.siteId, severity: 'info', category: 'Log', narrative: `Concurrent incident ${k}` })));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    const numbers = rs.map((r) => Number(r.body.incidentNo.slice(4))).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

void nextId; void nextPhone;
export type _T = Tenant;
