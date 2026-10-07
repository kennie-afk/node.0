import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { member, signUp } from './giving-helpers';

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });
const app = createApp();
let admin: { Authorization: string };

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  admin = (await signUp(app, 'attend')).admin;
});

const post = (path: string, body: object) => request(app).post(path).set(admin).send(body);
const list = (query: string) => request(app).get(`/attendance?${query}`).set(admin);

describe('attendance list: filters, search and paging', () => {
  it('filters by event and sermon and by kind, and searches member and guest names', async () => {
    const wanjiku = await member(app, admin, 'Wanjiku', 'Kamau');
    const event = (await post('/events', { name: 'Harvest day', startTime: '2026-10-04T09:00' })).body.id;
    const sermon = (await post('/sermons', { title: 'Walking in faith', datePreached: '2026-10-04' })).body.id;
    expect((await post('/attendance', { memberId: wanjiku, attendanceDate: '2026-10-04', eventId: event, attendanceType: 'In-person' })).status).toBe(201);
    expect((await post('/attendance', { guestName: 'Visitor Otieno', attendanceDate: '2026-10-04', sermonId: sermon, attendanceType: 'Online' })).status).toBe(201);
    expect((await post('/attendance', { guestName: 'Plain guest', attendanceDate: '2026-10-05', attendanceType: 'Other' })).status).toBe(201);

    expect((await list('')).body.data).toHaveLength(3);
    expect((await list(`eventId=${event}`)).body.data).toHaveLength(1);
    expect((await list(`sermonId=${sermon}`)).body.data[0].guestName).toBe('Visitor Otieno');
    expect((await list('kind=event')).body.data).toHaveLength(1);
    expect((await list('kind=sermon')).body.data).toHaveLength(1);
    expect((await list('q=kamau')).body.data).toHaveLength(1);
    expect((await list('q=otieno')).body.data).toHaveLength(1);
    expect((await list('q=zzzz')).body.data).toHaveLength(0);
    expect((await list('q=%25')).body.data).toHaveLength(3);
    expect((await list(`kind=event&q=otieno`)).body.data).toHaveLength(0);
  });

  it('pages on the server', async () => {
    for (let i = 0; i < 30; i++) await post('/attendance', { guestName: `Guest ${i}`, attendanceDate: '2026-10-04', attendanceType: 'In-person' });
    const first = await list('');
    // The default is a cursor page (no count); `page=` still gives the numbered shape with a total.
    expect(first.body.total).toBeUndefined();
    expect(first.body.data).toHaveLength(25);
    const second = await list(`cursor=${first.body.nextCursor}`);
    expect(second.body.data).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();
    expect((await list('page=2')).body.data).toHaveLength(5);
    expect((await list('page=1')).body.total).toBe(30);
  });

  it('never shows another church\'s records', async () => {
    await post('/attendance', { guestName: 'Mine', attendanceDate: '2026-10-04', attendanceType: 'In-person' });
    const other = (await signUp(app, 'attend-elsewhere')).admin;
    await request(app).post('/attendance').set(other).send({ guestName: 'Theirs', attendanceDate: '2026-10-04', attendanceType: 'In-person' });
    expect((await list('q=theirs')).body.data).toHaveLength(0);
  });

  it('accepts a plain date and lets optional links be cleared with null', async () => {
    const m = await member(app, admin, 'Achieng', 'Odhiambo');
    const event = (await post('/events', { name: 'Youth night', startTime: '2026-10-04T18:00' })).body.id;
    const made = await post('/attendance', { memberId: m, attendanceDate: '2026-10-04', eventId: event, attendanceType: 'In-person', notes: 'Early' });
    expect(made.status).toBe(201);
    const cleared = await request(app).put(`/attendance/${made.body.id}`).set(admin).send({ eventId: null, notes: null, guestName: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.eventId).toBeNull();
    expect(cleared.body.notes).toBeNull();
    const orphan = await request(app).put(`/attendance/${made.body.id}`).set(admin).send({ memberId: null, guestName: null });
    expect(orphan.status).toBe(400);
  });
});

describe('deleting users', () => {
  it('refuses to delete yourself, and the last administrator, but deletes another user', async () => {
    const users = (await request(app).get('/users').set(admin)).body.data as Array<{ id: number }>;
    const selfId = users[0].id;
    const own = await request(app).delete(`/users/${selfId}`).set(admin);
    expect(own.status).toBe(400);
    expect(own.body.message ?? own.body.error).toMatch(/own account/i);

    const other = await post('/users', { username: 'helper', email: 'helper@example.org', password: 'passphrase-help', role: 'MEMBER' });
    expect((await request(app).delete(`/users/${other.body.id}`).set(admin)).status).toBe(204);

    const second = await post('/users', { username: 'second', email: 'second@example.org', password: 'passphrase-sec', role: 'ADMIN' });
    const login = await request(app).post('/auth/login').send({ email: 'second@example.org', password: 'passphrase-sec' });
    const secondAuth = { Authorization: `Bearer ${login.body.token}` };
    // Two admins: one may remove the other; then the survivor is the last one and cannot be removed by anyone else.
    expect((await request(app).delete(`/users/${selfId}`).set(secondAuth)).status).toBe(204);
    const last = await request(app).delete(`/users/${second.body.id}`).set(secondAuth);
    expect(last.status).toBe(400);
  });
});
