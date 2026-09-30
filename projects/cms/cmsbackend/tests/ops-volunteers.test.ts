import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { inChurch, makeChurch, makeMember, makeUser } from './ops-helpers';

// A real Postgres under load truncates slowly; the defaults are tuned for in-memory SQLite.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const app = createApp();
let church: number;
let admin: { id: number; headers: { Authorization: string } };

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  church = await makeChurch('serve');
  admin = await makeUser(church, 'ADMIN', 'admin');
});

const as = (h = admin.headers) => ({ get: (u: string) => request(app).get(u).set(h), post: (u: string) => request(app).post(u).set(h), del: (u: string) => request(app).delete(u).set(h) });
const event = (name: string, hour: number, hours = 2) =>
  inChurch(church, () => db.Event.create({ churchId: church, name, startTime: new Date(Date.UTC(2031, 0, 5, hour)), endTime: new Date(Date.UTC(2031, 0, 5, hour + hours)), type: 'Service' }));

async function team(name: string, ...memberIds: number[]) {
  const t = await as().post('/volunteers/teams').send({ name }).expect(201);
  for (const id of memberIds) await as().post(`/volunteers/teams/${t.body.id}/members`).send({ memberId: id }).expect(201);
  return t.body.id as number;
}

describe('rosters', () => {
  it('assigns a team member to an event and refuses a double booking across teams', async () => {
    const amina = await makeMember(church, { firstName: 'Amina' });
    const ushers = await team('Ushers', amina);
    const media = await team('Media', amina);
    const service = await event('Sunday service', 9);
    const overlapping = await event('Youth service', 10);
    const later = await event('Evening', 14);

    const ok = await as().post('/volunteers/rosters').send({ eventId: service.id, teamId: ushers, memberId: amina }).expect(201);
    expect(ok.body).toMatchObject({ status: 'PENDING', eventName: 'Sunday service', teamName: 'Ushers' });
    const clash = await as().post('/volunteers/rosters').send({ eventId: overlapping.id, teamId: media, memberId: amina });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/already rostered for "Sunday service"/);
    await as().post('/volunteers/rosters').send({ eventId: later.id, teamId: media, memberId: amina }).expect(201);
    expect((await as().get(`/volunteers/rosters?memberId=${amina}`)).body.data).toHaveLength(2);
  });

  it('refuses someone not on the team, and someone marked unavailable', async () => {
    const amina = await makeMember(church);
    const brian = await makeMember(church);
    const ushers = await team('Ushers', amina);
    const service = await event('Sunday service', 9);
    await as().post('/volunteers/rosters').send({ eventId: service.id, teamId: ushers, memberId: brian }).expect(400);
    await as().post('/volunteers/unavailability').send({ memberId: amina, fromDate: '2031-01-01', toDate: '2031-01-10', reason: 'travelling' }).expect(201);
    const res = await as().post('/volunteers/rosters').send({ eventId: service.id, teamId: ushers, memberId: amina });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/unavailable.*travelling/);
  });

  it('lets a volunteer answer for themself but not for anyone else', async () => {
    const amina = await makeMember(church);
    const brian = await makeMember(church);
    const ushers = await team('Ushers', amina, brian);
    const service = await event('Sunday service', 9);
    const a = await as().post('/volunteers/rosters').send({ eventId: service.id, teamId: ushers, memberId: amina }).expect(201);
    const aminaUser = await makeUser(church, 'MEMBER', 'amina', amina);
    const brianUser = await makeUser(church, 'MEMBER', 'brian', brian);
    await request(app).post(`/volunteers/rosters/${a.body.id}/respond`).set(brianUser.headers).send({ status: 'CONFIRMED' }).expect(403);
    const confirmed = await request(app).post(`/volunteers/rosters/${a.body.id}/respond`).set(aminaUser.headers).send({ status: 'CONFIRMED' }).expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');
    await request(app).post('/volunteers/rosters').set(aminaUser.headers).send({ eventId: service.id, teamId: ushers, memberId: brian }).expect(403);
  });

  it('runs a swap: request, approve with a free replacement, refuse a busy one', async () => {
    const [amina, brian, carol] = [await makeMember(church), await makeMember(church), await makeMember(church)];
    const ushers = await team('Ushers', amina, brian, carol);
    const media = await team('Media', carol);
    const service = await event('Sunday service', 9);
    const other = await event('Youth', 10);
    const a = await as().post('/volunteers/rosters').send({ eventId: service.id, teamId: ushers, memberId: amina }).expect(201);
    await as().post('/volunteers/rosters').send({ eventId: other.id, teamId: media, memberId: carol }).expect(201);
    const aminaUser = await makeUser(church, 'MEMBER', 'amina', amina);

    const busy = await request(app).post('/volunteers/swaps').set(aminaUser.headers).send({ assignmentId: a.body.id, toMemberId: carol, reason: 'exam' }).expect(201);
    await as().post(`/volunteers/swaps/${busy.body.id}/approve`).expect(409);
    await request(app).post(`/volunteers/swaps/${busy.body.id}/cancel`).set(aminaUser.headers).expect(200);

    const good = await request(app).post('/volunteers/swaps').set(aminaUser.headers).send({ assignmentId: a.body.id, toMemberId: brian }).expect(201);
    await request(app).post('/volunteers/swaps').set(aminaUser.headers).send({ assignmentId: a.body.id, toMemberId: brian }).expect(409);
    await request(app).post(`/volunteers/swaps/${good.body.id}/approve`).set(aminaUser.headers).expect(403);
    await as().post(`/volunteers/swaps/${good.body.id}/approve`).expect(200);
    const list = (await as().get(`/volunteers/rosters?eventId=${service.id}`)).body.data;
    expect(list[0]).toMatchObject({ memberId: brian, status: 'PENDING' });
  });

  it('lists upcoming assignments still waiting for an answer', async () => {
    const amina = await makeMember(church, { phoneNumber: '0712345678' });
    const ushers = await team('Ushers', amina);
    const soon = await inChurch(church, () => db.Event.create({ churchId: church, name: 'Tomorrow', startTime: new Date(Date.now() + 24 * 3600_000), endTime: new Date(Date.now() + 26 * 3600_000), type: 'Service' }));
    await as().post('/volunteers/rosters').send({ eventId: soon.id, teamId: ushers, memberId: amina }).expect(201);
    const r = await as().get('/volunteers/reminders?hours=48').expect(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ eventName: 'Tomorrow', phoneNumber: '0712345678' });
  });

  it('keeps one church out of another', async () => {
    const amina = await makeMember(church);
    const ushers = await team('Ushers', amina);
    const other = await makeChurch('other');
    const outsider = await makeUser(other, 'ADMIN', 'out');
    expect((await request(app).get('/volunteers/teams').set(outsider.headers)).body).toEqual([]);
    await request(app).post(`/volunteers/teams/${ushers}/members`).set(outsider.headers).send({ memberId: amina }).expect(404);
    const plain = await makeUser(church, 'MEMBER', 'plain');
    await request(app).get('/volunteers/teams').set(plain.headers).expect(403);
  });
});
