import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { member, signUp, userWithRole } from './giving-helpers';

const app = createApp();
beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await truncateAll();
  await db.sequelize.close();
});

describe('member fields and filters', () => {
  it('stores the fields the model holds, and rejects bad values', async () => {
    const { admin } = await signUp(app, 'fields');
    const ok = await request(app).post('/members').set(admin).send({
      firstName: 'Amina', lastName: 'Wanjiru', middleName: 'Njeri', city: 'Nairobi', county: 'Nairobi', postalCode: '00100',
      status: 'New Convert', baptismDate: '2024-03-03', membershipDate: '2024-04-01'
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ middleName: 'Njeri', city: 'Nairobi', status: 'New Convert', baptismDate: '2024-03-03', membershipDate: '2024-04-01' });
    expect((await request(app).post('/members').set(admin).send({ firstName: 'Bad', lastName: 'Status', status: 'Retired' })).status).toBe(400);
    expect((await request(app).post('/members').set(admin).send({ firstName: 'Bad', lastName: 'Date', baptismDate: '03/03/2024' })).status).toBe(400);
    const edited = await request(app).put(`/members/${ok.body.id}`).set(admin).send({ status: 'Inactive', city: null });
    expect(edited.body).toMatchObject({ status: 'Inactive', city: null });
  });

  it('filters by status, family, ministry, joined range and search, paging with a cursor and no total', async () => {
    const { admin } = await signUp(app, 'filters');
    const family = (await request(app).post('/families').set(admin).send({ familyName: 'Otieno' })).body;
    const ministry = (await request(app).post('/ministries').set(admin).send({ name: 'Ushers' })).body;
    const make = async (firstName: string, extra: Record<string, unknown>) =>
      (await request(app).post('/members').set(admin).send({ firstName, lastName: 'Filt', ...extra })).body.id as number;
    const a = await make('Aaron', { status: 'Active', membershipDate: '2020-01-10', familyId: family.id });
    const b = await make('Bella', { status: 'Inactive', membershipDate: '2022-06-10' });
    const c = await make('Caleb', { status: 'Active', membershipDate: '2024-02-10', familyId: family.id });
    await make('Dina', { status: 'Active', membershipDate: '2024-09-10' });
    await request(app).post(`/ministries/${ministry.id}/members`).set(admin).send({ memberId: b });

    const names = async (qs: string) => (await request(app).get(`/members?${qs}`).set(admin)).body.data.map((m: any) => m.firstName);
    expect(await names('status=Inactive')).toEqual(['Bella']);
    expect(await names(`familyId=${family.id}`)).toEqual(['Aaron', 'Caleb']);
    expect(await names(`ministryId=${ministry.id}`)).toEqual(['Bella']);
    expect(await names('joinedFrom=2022-01-01&joinedTo=2024-03-01')).toEqual(['Bella', 'Caleb']);
    expect(await names('q=dina')).toEqual(['Dina']);
    expect(await names('status=Active&joinedFrom=2024-01-01')).toEqual(['Caleb', 'Dina']);
    expect((await request(app).get('/members?status=Nope').set(admin)).status).toBe(400);

    const first = await request(app).get('/members?limit=2').set(admin);
    expect(first.body.data.map((m: any) => m.firstName)).toEqual(['Aaron', 'Bella']);
    expect(first.body.total).toBeUndefined();
    expect(first.body.nextCursor).toBeTruthy();
    const second = await request(app).get(`/members?limit=2&cursor=${first.body.nextCursor}`).set(admin);
    expect(second.body.data.map((m: any) => m.firstName)).toEqual(['Caleb', 'Dina']);
    expect(second.body.nextCursor).toBeNull();
    expect(c).toBeGreaterThan(a);
    // The numbered shape is still there for callers that ask for it.
    expect((await request(app).get('/members?page=1&pageSize=2').set(admin)).body.total).toBe(4);
  });

  it('keyset pages do not repeat or skip members that share a first name', async () => {
    const { admin } = await signUp(app, 'ties');
    for (let i = 0; i < 5; i += 1) await member(app, admin, 'Same', `Name${i}`);
    const seen: number[] = [];
    let cursor = '';
    for (let guard = 0; guard < 10; guard += 1) {
      const res = await request(app).get(`/members?limit=2${cursor ? `&cursor=${cursor}` : ''}`).set(admin);
      seen.push(...res.body.data.map((m: any) => m.id));
      if (!res.body.nextCursor) break;
      cursor = res.body.nextCursor;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('attendance and contributions page by cursor too', async () => {
    const { admin } = await signUp(app, 'cursors');
    const m = await member(app, admin, 'Cur', 'Sor');
    for (const d of ['2025-01-05', '2025-01-12', '2025-01-19']) {
      await request(app).post('/attendance').set(admin).send({ memberId: m, attendanceDate: d, attendanceType: 'In-person' });
    }
    const p1 = await request(app).get('/attendance?limit=2').set(admin);
    expect(p1.body.data.map((r: any) => r.attendanceDate)).toEqual(['2025-01-19', '2025-01-12']);
    expect(p1.body.total).toBeUndefined();
    const p2 = await request(app).get(`/attendance?limit=2&cursor=${p1.body.nextCursor}`).set(admin);
    expect(p2.body.data.map((r: any) => r.attendanceDate)).toEqual(['2025-01-05']);
    expect(p2.body.nextCursor).toBeNull();

    for (const d of ['2025-02-01', '2025-02-02', '2025-02-03']) {
      await request(app).post('/contributions').set(admin).send({ memberId: m, amount: 100, date: d, contributionType: 'Offering' });
    }
    const g1 = await request(app).get('/contributions?limit=2').set(admin);
    expect(g1.body.data).toHaveLength(2);
    expect(g1.body.total).toBeUndefined();
    const g2 = await request(app).get(`/contributions?limit=2&cursor=${g1.body.nextCursor}`).set(admin);
    expect(g2.body.data).toHaveLength(1);
    expect((await request(app).get('/contributions?page=1').set(admin)).body.total).toBe(3);
  });
});

describe('member profile', () => {
  it('assembles details, family, ministries, groups, attendance, giving and care for one person', async () => {
    const { admin } = await signUp(app, 'profile');
    const family = (await request(app).post('/families').set(admin).send({ familyName: 'Mwangi' })).body;
    const id = (await request(app).post('/members').set(admin).send({ firstName: 'Grace', lastName: 'Mwangi', familyId: family.id })).body.id;
    await request(app).post('/members').set(admin).send({ firstName: 'Peter', lastName: 'Mwangi', familyId: family.id });
    const ministry = (await request(app).post('/ministries').set(admin).send({ name: 'Choir' })).body;
    await request(app).post(`/ministries/${ministry.id}/members`).set(admin).send({ memberId: id, role: 'Alto' });
    const today = new Date().toISOString().slice(0, 10);
    await request(app).post('/attendance').set(admin).send({ memberId: id, attendanceDate: today, attendanceType: 'In-person' });
    expect((await request(app).post('/contributions').set(admin).send({ memberId: id, amount: 1500, date: today, contributionType: 'Tithe' })).status).toBe(201);
    expect((await request(app).post('/care/notes').set(admin).send({ memberId: id, body: 'Visited after surgery' })).status).toBe(201);

    const res = await request(app).get(`/members/${id}/profile`).set(admin);
    expect(res.status).toBe(200);
    expect(res.body.member).toMatchObject({ id, firstName: 'Grace', family: { familyName: 'Mwangi' } });
    expect(res.body.familyMembers.map((m: any) => m.firstName)).toEqual(['Peter']);
    expect(res.body.ministries).toEqual([{ id: ministry.id, name: 'Choir', role: 'Alto' }]);
    expect(res.body.attendance.last90Days).toBe(1);
    expect(res.body.giving).toMatchObject({ giftCount: 1, totalMinor: 150000 });
    expect(res.body.giving.recent).toHaveLength(1);
    expect(res.body.care.notes[0].body).toBe('Visited after surgery');
  });

  it('leaves out giving and care for a role that does not hold those permissions', async () => {
    const { admin } = await signUp(app, 'profileperm');
    const id = await member(app, admin, 'Sensitive', 'Person');
    await request(app).post('/contributions').set(admin).send({ memberId: id, amount: 50, date: '2025-01-01', contributionType: 'Offering' });
    await request(app).post('/care/notes').set(admin).send({ memberId: id, body: 'Private matter' });
    const treasurer = await userWithRole(app, admin, 'treas', 'TREASURER');
    const secretary = await userWithRole(app, admin, 'secr', 'SECRETARY');
    const t = (await request(app).get(`/members/${id}/profile`).set(treasurer)).body;
    expect(t.giving.giftCount).toBe(1);
    expect(t.care).toBeNull();
    const s = (await request(app).get(`/members/${id}/profile`).set(secretary)).body;
    expect(s.giving).toBeNull();
    expect(JSON.stringify(s)).not.toContain('"amountMinor"');
    expect(s.care.notes).toHaveLength(1);
  });

  it('is tenant scoped: another church gets a 404 and sees none of the data', async () => {
    const a = await signUp(app, 'profa');
    const b = await signUp(app, 'profb');
    const id = await member(app, a.admin, 'Only', 'InA');
    expect((await request(app).get(`/members/${id}/profile`).set(b.admin)).status).toBe(404);
    expect((await request(app).get('/members?q=Only').set(b.admin)).body.data).toEqual([]);
    expect((await request(app).get(`/members/${id}/profile`).set(a.admin)).status).toBe(200);
  });
});
