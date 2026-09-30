import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { inChurch, makeChurch, makeMember, makeUser } from './ops-helpers';
import { select } from '../src/modules/finance/sql';
import { requestTx } from '../src/common/http';

// A real Postgres under load truncates slowly; the defaults are tuned for in-memory SQLite.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const app = createApp();
let church: number;
let admin: any;

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  church = await makeChurch('me');
  admin = await makeUser(church, 'ADMIN', 'admin');
});
const api = (h: any) => ({ get: (u: string) => request(app).get(u).set(h.headers), post: (u: string) => request(app).post(u).set(h.headers), put: (u: string) => request(app).put(u).set(h.headers), del: (u: string) => request(app).delete(u).set(h.headers) });

async function linkedMember() {
  const family = await inChurch(church, () => db.Family.create({ churchId: church, familyName: 'Wanjiru' }));
  const memberId = await makeMember(church, { firstName: 'Amina', lastName: 'Wanjiru', phoneNumber: '+254712345678', familyId: family.id });
  await makeMember(church, { firstName: 'Baby', lastName: 'Wanjiru', familyId: family.id });
  const user = await makeUser(church, 'MEMBER', 'amina');
  await api(admin).post('/account-links').send({ userId: user.id, memberId }).expect(201);
  return { memberId, user, family };
}

describe('linking accounts to members', () => {
  it('lets an administrator link, refuses a second account for one member, and unlinks', async () => {
    const { memberId, user } = await linkedMember();
    const second = await makeUser(church, 'MEMBER', 'other');
    await api(admin).post('/account-links').send({ userId: second.id, memberId }).expect(409);
    const list = (await api(admin).get('/account-links').expect(200)).body;
    expect(list.find((l: any) => l.userId === user.id).memberId).toBe(memberId);
    await api(user).post('/account-links').send({ userId: second.id, memberId }).expect(403);
    await api(admin).del(`/account-links/${user.id}`).expect(204);
    await api(admin).del(`/account-links/${user.id}`).expect(404);
    await api(user).get('/me/groups').expect(403);
  });

  it('refuses to link across churches', async () => {
    const other = await makeChurch('elsewhere');
    const foreignMember = await makeMember(other);
    const user = await makeUser(church, 'MEMBER', 'amina');
    await api(admin).post('/account-links').send({ userId: user.id, memberId: foreignMember }).expect(404);
  });
});

describe('/me', () => {
  it('returns the signed-in person, their member record and permissions', async () => {
    const { user } = await linkedMember();
    const me = (await api(user).get('/me').expect(200)).body;
    expect(me.user).toMatchObject({ username: 'amina', role: 'MEMBER' });
    expect(me.member).toMatchObject({ firstName: 'Amina', phoneNumber: '+254712345678' });
    expect(me.permissions).toEqual([]);
    const unlinked = await makeUser(church, 'MEMBER', 'nolink');
    expect((await api(unlinked).get('/me').expect(200)).body.member).toBeNull();
    await request(app).get('/me').expect(401);
  });

  it('lets a member correct their contact details but not their status or anyone else', async () => {
    const { user, memberId } = await linkedMember();
    const updated = (await api(user).put('/me/profile').send({ phoneNumber: '0799888777', city: 'Nakuru', email: 'Amina@Example.org' }).expect(200)).body;
    expect(updated.member).toMatchObject({ phoneNumber: '+254799888777', city: 'Nakuru', email: 'amina@example.org' });
    await api(user).put('/me/profile').send({ status: 'Deceased' }).expect(400);
    await api(user).put('/me/profile').send({ firstName: 'Changed', id: 999 }).expect(400);
    await api(user).put('/me/profile').send({ phoneNumber: '12' }).expect(400);
    const stored = (await inChurch(church, async () => select<any>(await requestTx(), 'SELECT status, first_name FROM members WHERE id = ?', [memberId])))[0];
    expect(stored).toMatchObject({ status: 'Active', first_name: 'Amina' });
    const unlinked = await makeUser(church, 'MEMBER', 'nolink');
    await api(unlinked).put('/me/profile').send({ city: 'X' }).expect(403);
  });

  it('shows the member their own groups, events, family and giving only', async () => {
    const { user, memberId, family } = await linkedMember();
    const ministry = await inChurch(church, () => db.Ministry.create({ churchId: church, name: 'Choir' }));
    await inChurch(church, () => db.MinistryMember.create({ churchId: church, ministryId: ministry.id, memberId, role: 'Soprano' }));
    const group = await inChurch(church, () => db.SmallGroup.create({ churchId: church, name: 'Westlands cell', ministryId: ministry.id }));
    await inChurch(church, () => db.SmallGroupMember.create({ churchId: church, smallGroupId: group.id, memberId }));
    await inChurch(church, () => db.Event.create({ churchId: church, name: 'Harvest Sunday', startTime: new Date(Date.now() + 86_400_000), type: 'Service' }));
    const groups = (await api(user).get('/me/groups').expect(200)).body;
    expect(groups.ministries[0]).toMatchObject({ name: 'Choir', role: 'Soprano' });
    expect(groups.smallGroups[0].name).toBe('Westlands cell');
    expect((await api(user).get('/me/events').expect(200)).body.upcoming[0].name).toBe('Harvest Sunday');
    const fam = (await api(user).get('/me/family').expect(200)).body;
    expect(fam.family.id).toBe(family.id);
    expect(fam.members.map((m: any) => m.firstName).sort()).toEqual(['Amina', 'Baby']);
    expect(JSON.stringify(fam)).not.toContain('phone');

    const someoneElse = await makeMember(church);
    await inChurch(church, () => db.Contribution.create({ churchId: church, memberId, amount: 1500, date: new Date(Date.UTC(2031, 2, 1)), contributionType: 'Tithe' }));
    await inChurch(church, () => db.Contribution.create({ churchId: church, memberId: someoneElse, amount: 9999, date: new Date(Date.UTC(2031, 2, 1)), contributionType: 'Tithe' }));
    const giving = (await api(user).get('/me/giving?year=2031').expect(200)).body;
    expect(giving.data).toHaveLength(1);
    expect(giving.data[0]).toMatchObject({ amount: '1500.00', type: 'Tithe', date: '2031-03-01' });
    expect(giving.totalForYear).toBe('1500.00');
  });

  it('lets a member submit a prayer request and manage their own consent', async () => {
    const { user } = await linkedMember();
    const pr = (await api(user).post('/me/prayer-requests').send({ body: 'Pray for my exams' }).expect(201)).body;
    expect(pr).toMatchObject({ isPrivate: true, status: 'OPEN' });
    const consents = (await api(user).post('/me/consents').send({ purpose: 'COMMUNICATIONS', channel: 'SMS', granted: false }).expect(201)).body;
    expect(consents[0]).toMatchObject({ purpose: 'COMMUNICATIONS', granted: false, source: 'SELF' });
    await api(user).get('/care/prayer-requests').expect(403);
  });
});
