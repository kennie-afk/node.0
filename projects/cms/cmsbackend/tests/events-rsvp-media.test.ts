import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import db from '@models';
import { createApp } from '../src/app';
import { LocalObjectStore, setObjectStore } from '../src/common/object-store';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { member, signUp, userWithRole } from './giving-helpers';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });
const app = createApp();
let admin: { Authorization: string };
let churchId: number;
let dir: string;

beforeAll(async () => {
  await prepareDatabase();
  dir = mkdtempSync(path.join(tmpdir(), 'cms-media-'));
  setObjectStore(new LocalObjectStore(dir));
});
afterAll(async () => {
  setObjectStore(null);
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  dir = mkdtempSync(path.join(tmpdir(), 'cms-media-'));
  setObjectStore(new LocalObjectStore(dir));
  const s = await signUp(app, 'events');
  admin = s.admin;
  churchId = s.id;
});

const makeEvent = async (extra: Record<string, unknown> = {}) => {
  const res = await request(app).post('/events').set(admin).send({ name: 'Youth class', startTime: '2026-10-04T16:00', ...extra });
  expect(res.status).toBe(201);
  return res.body;
};

describe('recurring events', () => {
  it('validates the repeat rule and expands occurrences for a window, with the right duration', async () => {
    expect((await request(app).post('/events').set(admin).send({ name: 'Bad repeat', startTime: '2026-10-04T16:00', isRecurring: true, recurrencePattern: 'Every Sunday' })).status).toBe(400);
    expect((await request(app).post('/events').set(admin).send({ name: 'No rule given', startTime: '2026-10-04T16:00', isRecurring: true })).status).toBe(400);
    const weekly = await makeEvent({ name: 'Sunday service', endTime: '2026-10-04T18:00', isRecurring: true, recurrencePattern: 'FREQ=WEEKLY;COUNT=4' });
    await makeEvent({ name: 'One-off outreach', startTime: '2026-10-10T09:00' });
    await makeEvent({ name: 'Out of window', startTime: '2027-03-01T09:00' });

    const res = await request(app).get('/events/occurrences?from=2026-10-01&to=2026-10-31').set(admin);
    expect(res.status).toBe(200);
    const rows = res.body.data.map((o: any) => `${o.date} ${o.name}`);
    expect(rows).toEqual(['2026-10-04 Sunday service', '2026-10-10 One-off outreach', '2026-10-11 Sunday service', '2026-10-18 Sunday service', '2026-10-25 Sunday service']);
    expect(res.body.data[0]).toMatchObject({ eventId: weekly.id, recurring: true });
    expect(new Date(res.body.data[0].endsAt).getTime() - new Date(res.body.data[0].startsAt).getTime()).toBe(2 * 3600_000);
    // The series stops at COUNT: November has none left.
    expect((await request(app).get('/events/occurrences?from=2026-11-01&to=2026-11-30').set(admin)).body.data).toEqual([]);
    expect((await request(app).get('/events/occurrences?from=2026-01-01&to=2028-01-01').set(admin)).status).toBe(400);
  });

  it('shows only this church’s events', async () => {
    await makeEvent({ name: 'Ours' });
    const other = await signUp(app, 'events-other');
    expect((await request(app).get('/events/occurrences?from=2026-10-01&to=2026-10-31').set(other.admin)).body.data).toEqual([]);
  });
});

describe('event registration with capacity and a waitlist', () => {
  it('fills seats, waitlists the overflow, and promotes in order when someone cancels', async () => {
    const ev = await makeEvent({ capacity: 3, isRecurring: true, recurrencePattern: 'FREQ=WEEKLY' });
    const date = '2026-10-11';
    const a = await member(app, admin, 'Amina', 'One');
    const b = await member(app, admin, 'Bella', 'Two');
    const reg = (body: Record<string, unknown>) => request(app).post(`/events/${ev.id}/rsvps`).set(admin).send({ occurrenceDate: date, ...body });

    const r1 = await reg({ memberId: a, partySize: 2 });
    expect(r1.body.status).toBe('GOING');
    expect((await reg({ memberId: a })).status).toBe(409);
    const r2 = await reg({ memberId: b, partySize: 2 });
    expect(r2.body.status).toBe('WAITLIST');
    const r3 = await reg({ guestName: 'Walk-in Guest' });
    expect(r3.body.status).toBe('GOING');
    const r4 = await reg({ guestName: 'Late Guest' });
    expect(r4.body.status).toBe('WAITLIST');

    const roster = await request(app).get(`/events/${ev.id}/rsvps?date=${date}`).set(admin);
    expect(roster.body).toMatchObject({ capacity: 3, seatsTaken: 3, seatsLeft: 0, waitlisted: 2 });
    expect(roster.body.data.filter((r: any) => r.waitlistPosition).map((r: any) => r.waitlistPosition)).toEqual([1, 2]);

    // Amina cancels: 2 seats free; Bella (2) is first in line and fits, the late guest does not.
    const cancel = await request(app).delete(`/events/${ev.id}/rsvps/${r1.body.id}`).set(admin);
    expect(cancel.body.promoted).toEqual([r2.body.id]);
    const after = await request(app).get(`/events/${ev.id}/rsvps?date=${date}`).set(admin);
    expect(after.body.seatsTaken).toBe(3);
    expect(after.body.data.find((r: any) => r.id === r4.body.id).status).toBe('WAITLIST');
    // Another date has its own seats.
    expect((await request(app).post(`/events/${ev.id}/rsvps`).set(admin).send({ occurrenceDate: '2026-10-18', memberId: a, partySize: 3 })).body.status).toBe('GOING');
    // Raising capacity promotes the waitlist.
    const raised = await request(app).put(`/events/${ev.id}`).set(admin).send({ capacity: 10 });
    expect(raised.body.promotedFromWaitlist).toEqual([r4.body.id]);
  });

  it('refuses a date the event does not occur on, a foreign member, and unauthorised callers', async () => {
    const ev = await makeEvent({ isRecurring: true, recurrencePattern: 'FREQ=WEEKLY' });
    const reg = (body: Record<string, unknown>, as = admin) => request(app).post(`/events/${ev.id}/rsvps`).set(as).send(body);
    expect((await reg({ occurrenceDate: '2026-10-05', guestName: 'Wrong Day' })).status).toBe(400);
    expect((await reg({ occurrenceDate: '2026-10-04' })).status).toBe(400);
    const other = await signUp(app, 'events-foreign');
    const foreign = await member(app, other.admin, 'Fred', 'Foreign');
    expect((await reg({ occurrenceDate: '2026-10-04', memberId: foreign })).status).toBe(400);
    expect((await request(app).post(`/events/${ev.id}/rsvps`).set(other.admin).send({ occurrenceDate: '2026-10-04', guestName: 'Cross Tenant' })).status).toBe(404);
    const plain = await userWithRole(app, admin, 'plain', 'MEMBER');
    expect((await reg({ occurrenceDate: '2026-10-04', guestName: 'Nope Nope' }, plain)).status).toBe(403);
  });

  it('never oversells the last seat when two people book at once', async () => {
    const ev = await makeEvent({ capacity: 1 });
    const book = (guestName: string) => request(app).post(`/events/${ev.id}/rsvps`).set(admin).send({ occurrenceDate: '2026-10-04', guestName });
    const names = ['Guest One', 'Guest Two', 'Guest Three'];
    // SQLite has a single connection, so truly simultaneous requests only exist on Postgres (the FOR UPDATE lock is what is tested there).
    const results = onPostgres ? await Promise.all(names.map(book)) : [await book(names[0]), await book(names[1]), await book(names[2])];
    expect(results.map((r) => r.body.status).filter((s) => s === 'GOING')).toHaveLength(1);
  });
});

describe('sermon media', () => {
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(300, 1)]);
  const sermon = async () => (await request(app).post('/sermons').set(admin).send({ title: 'Grace abounds', datePreached: '2026-10-04' })).body;
  const up = (id: number, body: Buffer, type: string, name = 'sermon.mp3', as = admin) => request(app).post(`/sermons/${id}/media?fileName=${name}`).set(as).set('Content-Type', type).send(body);

  it('uploads audio, lists it, serves it through a signed link, and deletes the object with the file', async () => {
    const s = await sermon();
    const res = await up(s.id, mp3, 'audio/mpeg');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'audio', fileName: 'sermon.mp3', sizeBytes: mp3.length });
    expect((await request(app).get(`/sermons/${s.id}/media`).set(admin)).body).toHaveLength(1);
    const link = await request(app).get(`/sermons/${s.id}/media/${res.body.id}/link`).set(admin);
    const file = await request(app).get(link.body.url);
    expect(file.status).toBe(200);
    expect(Buffer.from(file.body).equals(mp3)).toBe(true);
    const folder = path.join(dir, 'tenants', String(churchId), 'sermons', String(s.id));
    expect(readdirSync(folder).filter((f) => !f.endsWith('.type'))).toHaveLength(1);
    expect((await request(app).delete(`/sermons/${s.id}/media/${res.body.id}`).set(admin)).status).toBe(204);
    expect(readdirSync(folder)).toHaveLength(0);
  });

  it('refuses a wrong type, a renamed file, and another church’s sermon; removes objects when the sermon is deleted', async () => {
    const s = await sermon();
    expect((await up(s.id, Buffer.from('<html>'), 'text/html')).status).toBe(400);
    expect((await up(s.id, Buffer.from('not really an mp3 at all'), 'audio/mpeg')).status).toBe(400);
    const other = await signUp(app, 'events-media-other');
    expect((await up(s.id, mp3, 'audio/mpeg', 'x.mp3', other.admin)).status).toBe(404);
    const kept = await up(s.id, mp3, 'audio/mpeg');
    const link = await request(app).get(`/sermons/${s.id}/media/${kept.body.id}/link`).set(admin);
    expect((await request(app).get(`/sermons/${s.id}/media/${kept.body.id}/link`).set(other.admin)).status).toBe(404);
    expect((await request(app).delete(`/sermons/${s.id}`).set(admin)).status).toBe(204);
    expect(existsSync(path.join(dir, 'tenants', String(churchId), 'sermons', String(s.id))) && readdirSync(path.join(dir, 'tenants', String(churchId), 'sermons', String(s.id))).length).toBeFalsy();
    expect((await request(app).get(link.body.url)).status).toBe(404);
  });
});
