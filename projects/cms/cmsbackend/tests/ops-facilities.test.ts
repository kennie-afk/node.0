import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import db from '@models';
import { createApp } from '../src/app';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { makeChurch, makeUser } from './ops-helpers';
import { occurrences } from '../src/modules/facilities/facilities.service';

// A real Postgres under load truncates slowly; the defaults are tuned for in-memory SQLite.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const app = createApp();
let church: number;
let admin: { id: number; headers: { Authorization: string } };
let sec: { id: number; headers: { Authorization: string } };

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  church = await makeChurch('rooms');
  admin = await makeUser(church, 'ADMIN', 'admin');
  sec = await makeUser(church, 'SECRETARY', 'sec');
});

const as = (h = admin.headers) => ({ get: (u: string) => request(app).get(u).set(h), post: (u: string) => request(app).post(u).set(h), put: (u: string) => request(app).put(u).set(h) });
const at = (day: number, hour: number) => new Date(Date.UTC(2031, 5, day, hour)).toISOString();
async function hall(requiresApproval = false) {
  return (await as().post('/facilities/resources').send({ name: 'Main Hall', capacity: 300, requiresApproval }).expect(201)).body.id as number;
}

describe('bookings', () => {
  it('books a room, refuses any overlap, and allows back-to-back bookings', async () => {
    const id = await hall();
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'Choir practice', startsAt: at(3, 10), endsAt: at(3, 12) }).expect(201);
    for (const [s, e] of [[at(3, 11), at(3, 13)], [at(3, 9), at(3, 11)], [at(3, 10), at(3, 12)], [at(3, 10), at(3, 11)]]) {
      const res = await as().post('/facilities/bookings').send({ resourceId: id, title: 'Clash', startsAt: s, endsAt: e });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Choir practice/);
    }
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'After', startsAt: at(3, 12), endsAt: at(3, 14) }).expect(201);
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'Before', startsAt: at(3, 8), endsAt: at(3, 10) }).expect(201);
    const busy = await as().get(`/facilities/resources/${id}/availability?from=${at(3, 0)}&to=${at(4, 0)}`).expect(200);
    expect(busy.body.busy).toHaveLength(3);
  });

  it('keeps a different resource independent', async () => {
    const a = await hall();
    const b = (await as().post('/facilities/resources').send({ name: 'Annex' }).expect(201)).body.id;
    await as().post('/facilities/bookings').send({ resourceId: a, title: 'Booking A', startsAt: at(3, 10), endsAt: at(3, 12) }).expect(201);
    await as().post('/facilities/bookings').send({ resourceId: b, title: 'Booking B', startsAt: at(3, 10), endsAt: at(3, 12) }).expect(201);
  });

  it('creates a recurring series atomically: one clash rejects the whole series', async () => {
    const id = await hall();
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'Wedding', startsAt: at(17, 10), endsAt: at(17, 12) }).expect(201);
    const series = { resourceId: id, title: 'Bible study', startsAt: at(3, 10), endsAt: at(3, 12), recurrence: { freq: 'WEEKLY', count: 4 } };
    const clash = await as().post('/facilities/bookings').send(series);
    expect(clash.status).toBe(409);
    expect((await as().get('/facilities/bookings')).body.data).toHaveLength(1);
    const ok = await as().post('/facilities/bookings').send({ ...series, startsAt: at(4, 10), endsAt: at(4, 12) }).expect(201);
    expect(ok.body.count).toBe(4);
    expect(new Set(ok.body.bookings.map((b: any) => b.seriesId)).size).toBe(1);
  });

  it('cancelling a series releases the slots', async () => {
    const id = await hall();
    const made = (await as().post('/facilities/bookings').send({ resourceId: id, title: 'Weekly', startsAt: at(3, 10), endsAt: at(3, 12), recurrence: { freq: 'WEEKLY', count: 3 } }).expect(201)).body;
    const first = made.bookings[0].id;
    expect((await as().post(`/facilities/bookings/${first}/cancel`).send({ scope: 'SERIES' }).expect(200)).body.cancelled).toBe(3);
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'Reuse', startsAt: at(3, 10), endsAt: at(3, 12) }).expect(201);
  });

  it('holds the slot for a pending request until an administrator approves or rejects', async () => {
    const id = await hall(true);
    const pending = (await as(sec.headers).post('/facilities/bookings').send({ resourceId: id, title: 'Youth night', startsAt: at(5, 18), endsAt: at(5, 21) }).expect(201)).body;
    expect(pending.status).toBe('PENDING');
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'Other', startsAt: at(5, 19), endsAt: at(5, 20) }).expect(409);
    await as(sec.headers).post(`/facilities/bookings/${pending.bookings[0].id}/approve`).expect(403);
    const approved = await as().post(`/facilities/bookings/${pending.bookings[0].id}/approve`).expect(200);
    expect(approved.body.status).toBe('APPROVED');
    await as().post(`/facilities/bookings/${pending.bookings[0].id}/approve`).expect(409);

    const second = (await as(sec.headers).post('/facilities/bookings').send({ resourceId: id, title: 'Retreat', startsAt: at(6, 18), endsAt: at(6, 21) }).expect(201)).body;
    await as().post(`/facilities/bookings/${second.bookings[0].id}/reject`).expect(200);
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'Now free', startsAt: at(6, 18), endsAt: at(6, 21) }).expect(201);
    const adminBooking = await as().post('/facilities/bookings').send({ resourceId: id, title: 'Admin books directly', startsAt: at(7, 18), endsAt: at(7, 19) }).expect(201);
    expect(adminBooking.body.status).toBe('APPROVED');
  });

  it('lets only the booker or an administrator cancel, and keeps churches apart', async () => {
    const id = await hall();
    const mine = (await as(sec.headers).post('/facilities/bookings').send({ resourceId: id, title: 'Mine', startsAt: at(3, 10), endsAt: at(3, 11) }).expect(201)).body;
    const pastor = await makeUser(church, 'PASTOR', 'pastor');
    await as(pastor.headers).post(`/facilities/bookings/${mine.bookings[0].id}/cancel`).send({}).expect(403);
    await as(sec.headers).post(`/facilities/bookings/${mine.bookings[0].id}/cancel`).send({}).expect(200);
    const other = await makeChurch('elsewhere');
    const outsider = await makeUser(other, 'ADMIN', 'out');
    await as(outsider.headers).post('/facilities/bookings').send({ resourceId: id, title: 'Steal', startsAt: at(3, 10), endsAt: at(3, 11) }).expect(404);
    await as(outsider.headers).get(`/facilities/bookings/${mine.bookings[0].id}`).expect(404);
    const plain = await makeUser(church, 'MEMBER', 'plain');
    await as(plain.headers).get('/facilities/resources').expect(403);
  });

  it('validates the times and the recurrence', async () => {
    const id = await hall();
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'Backwards', startsAt: at(3, 12), endsAt: at(3, 10) }).expect(400);
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'Too dense', startsAt: at(3, 10), endsAt: at(4, 12), recurrence: { freq: 'DAILY', count: 3 } }).expect(400);
    expect(occurrences(new Date(Date.UTC(2031, 0, 31, 9)), new Date(Date.UTC(2031, 0, 31, 10)), { freq: 'MONTHLY', count: 3 }).map((o) => o.start.toISOString().slice(0, 10))).toEqual(['2031-01-31', '2031-02-28', '2031-03-31']);
  });
});

describe.runIf(onPostgres)('on a real Postgres', () => {
  it('rejects an overlap in the database itself, even with the application bypassed', async () => {
    const id = await hall();
    await as().post('/facilities/bookings').send({ resourceId: id, title: 'Existing', startsAt: at(3, 10), endsAt: at(3, 12) }).expect(201);
    const owner = new pg.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
    await owner.connect();
    const insert = (status: string, s: string, e: string) => owner.query(`INSERT INTO facility_bookings (church_id, resource_id, title, starts_at, ends_at, status) VALUES ($1, $2, 'sneaky', $3, $4, $5)`, [church, id, s, e, status]);
    await expect(insert('APPROVED', at(3, 11), at(3, 13))).rejects.toThrow(/facility_no_double_booking/);
    await expect(insert('PENDING', at(3, 9), at(3, 11))).rejects.toThrow(/facility_no_double_booking/);
    await insert('CANCELLED', at(3, 11), at(3, 13));
    await insert('APPROVED', at(3, 12), at(3, 13));
    await owner.end();
  });

  it('lets exactly one of many simultaneous requests win a slot', async () => {
    const id = await hall();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => as().post('/facilities/bookings').send({ resourceId: id, title: `Racer ${i}`, startsAt: at(9, 10), endsAt: at(9, 12) })));
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(11);
    expect((await as().get('/facilities/bookings')).body.data).toHaveLength(1);
  });
});
