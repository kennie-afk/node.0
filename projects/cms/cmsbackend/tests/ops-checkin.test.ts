import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { makeChurch, makeUser } from './ops-helpers';

// A real Postgres under load truncates slowly; the defaults are tuned for in-memory SQLite.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const app = createApp();
let church: number;
let staff: { headers: { Authorization: string } };
let admin: { headers: { Authorization: string } };

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  church = await makeChurch('kids');
  staff = await makeUser(church, 'SECRETARY', 'sec');
  admin = await makeUser(church, 'ADMIN', 'admin');
});

const call = (h = staff.headers) => ({ get: (u: string) => request(app).get(u).set(h), post: (u: string) => request(app).post(u).set(h), put: (u: string) => request(app).put(u).set(h) });
const dobMonthsAgo = (months: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - months - 1); return d.toISOString().slice(0, 10); };

async function setup(capacity = 10) {
  const room = (await call().post('/checkin/rooms').send({ name: 'Toddlers', minAgeMonths: 12, maxAgeMonths: 48, capacity }).expect(201)).body;
  const child = (await call().post('/checkin/children').send({
    firstName: 'Zuri', lastName: 'Mwangi', dateOfBirth: dobMonthsAgo(30), allergies: 'Peanuts',
    guardians: [{ name: 'Mama Zuri', relationship: 'Mother', phone: '0712345678' }, { name: 'Uncle Joe', relationship: 'Uncle', isAuthorizedPickup: false }, { name: 'Baba Zuri', relationship: 'Father' }]
  }).expect(201)).body;
  return { room, child, mama: child.guardians[0].id, uncle: child.guardians[1].id, baba: child.guardians[2].id };
}

describe('check-in', () => {
  it('checks a child in, shows the allergy, and checks out with the right code and guardian', async () => {
    const s = await setup();
    const inRes = await call().post('/checkin/sessions').send({ childId: s.child.id, roomId: s.room.id, guardianId: s.mama }).expect(201);
    expect(inRes.body.pickupCode).toMatch(/^\d{6}$/);
    expect(inRes.body.child.allergies).toBe('Peanuts');
    expect(inRes.body.securityTag).toHaveLength(4);
    expect(inRes.body).not.toHaveProperty('pickupCodeHash');
    const stored = await db.sequelize.query('SELECT pickup_code_hash FROM checkin_sessions', { type: 'SELECT' as any });
    expect(JSON.stringify(stored)).not.toContain(inRes.body.pickupCode);

    const active = await call().get(`/checkin/sessions?status=IN&roomId=${s.room.id}`).expect(200);
    expect(active.body.data).toHaveLength(1);
    const out = await call().post(`/checkin/sessions/${inRes.body.id}/checkout`).send({ code: inRes.body.pickupCode, guardianId: s.mama }).expect(200);
    expect(out.body).toMatchObject({ status: 'OUT', flagged: false });
    await call().post(`/checkin/sessions/${inRes.body.id}/checkout`).send({ code: inRes.body.pickupCode, guardianId: s.mama }).expect(409);
  });

  it('records a denial even though the request fails, and locks after repeated wrong codes', async () => {
    const s = await setup();
    const inRes = (await call().post('/checkin/sessions').send({ childId: s.child.id, roomId: s.room.id, guardianId: s.mama })).body;
    const wrong = inRes.pickupCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const res = await call().post(`/checkin/sessions/${inRes.id}/checkout`).send({ code: wrong, guardianId: s.mama });
      expect(res.status).toBe(403);
    }
    const trail = await call().get(`/checkin/events?type=DENIED&childId=${s.child.id}`).expect(200);
    expect(trail.body.data).toHaveLength(5);
    const locked = await call().post(`/checkin/sessions/${inRes.id}/checkout`).send({ code: inRes.pickupCode, guardianId: s.mama });
    expect(locked.status).toBe(423);
    // Only an administrator can get past a lock, with a written reason.
    await call().post(`/checkin/sessions/${inRes.id}/checkout`).send({ code: wrong, guardianId: s.mama, overrideReason: 'verified ID in person' }).expect(403);
    const done = await call(admin.headers).post(`/checkin/sessions/${inRes.id}/checkout`).send({ code: wrong, guardianId: s.mama, overrideReason: 'verified ID in person' }).expect(200);
    expect(done.body.status).toBe('OUT');
    const overrides = await call().get('/checkin/events?type=OVERRIDE').expect(200);
    expect(overrides.body.data).toHaveLength(1);
  });

  it('refuses a guardian who is not authorised, or belongs to no child, and flags it', async () => {
    const s = await setup();
    const other = (await call().post('/checkin/children').send({ firstName: 'Kip', lastName: 'Otieno', dateOfBirth: dobMonthsAgo(24), guardians: [{ name: 'Stranger' }] }).expect(201)).body;
    const inRes = (await call().post('/checkin/sessions').send({ childId: s.child.id, roomId: s.room.id, guardianId: s.mama })).body;
    const denied = await call().post(`/checkin/sessions/${inRes.id}/checkout`).send({ code: inRes.pickupCode, guardianId: s.uncle });
    expect(denied.status).toBe(403);
    expect(denied.body.message).toMatch(/not authorised/);
    const foreign = await call().post(`/checkin/sessions/${inRes.id}/checkout`).send({ code: inRes.pickupCode, guardianId: other.guardians[0].id });
    expect(foreign.status).toBe(403);
    expect(foreign.body.message).toMatch(/not a registered guardian/);
    expect((await call().get('/checkin/events?type=FLAGGED').expect(200)).body.data.length).toBe(2);
    // The child is still checked in and the real guardian can collect.
    await call().post(`/checkin/sessions/${inRes.id}/checkout`).send({ code: inRes.pickupCode, guardianId: s.baba }).then((r) => {
      expect(r.status).toBe(200);
      expect(r.body.flagged).toBe(true);
    });
  });

  it('enforces capacity, the age group, and one active check-in per child', async () => {
    const s = await setup(1);
    await call().post('/checkin/sessions').send({ childId: s.child.id, roomId: s.room.id }).expect(201);
    await call().post('/checkin/sessions').send({ childId: s.child.id, roomId: s.room.id }).expect(409);
    const second = (await call().post('/checkin/children').send({ firstName: 'Amani', lastName: 'Ali', dateOfBirth: dobMonthsAgo(30) }).expect(201)).body;
    const full = await call().post('/checkin/sessions').send({ childId: second.id, roomId: s.room.id });
    expect(full.status).toBe(409);
    expect(full.body.message).toMatch(/full/);
    const baby = (await call().post('/checkin/children').send({ firstName: 'Baby', lastName: 'B', dateOfBirth: dobMonthsAgo(3) }).expect(201)).body;
    const wrongRoom = await call().post('/checkin/sessions').send({ childId: baby.id, roomId: s.room.id });
    expect(wrongRoom.status).toBe(409);
    expect(wrongRoom.body.message).toMatch(/months old/);
  });

  it('exports attendance as CSV and protects the data', async () => {
    const s = await setup();
    const inRes = (await call().post('/checkin/sessions').send({ childId: s.child.id, roomId: s.room.id, guardianId: s.mama })).body;
    await call().post(`/checkin/sessions/${inRes.id}/checkout`).send({ code: inRes.pickupCode, guardianId: s.mama }).expect(200);
    const from = new Date(Date.now() - 3600_000).toISOString();
    const to = new Date(Date.now() + 3600_000).toISOString();
    const csv = await call().get(`/checkin/export/attendance.csv?from=${from}&to=${to}`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('Zuri Mwangi,Toddlers');
    expect(csv.text).toContain('Mama Zuri');

    const plain = await makeUser(church, 'MEMBER', 'plain');
    await request(app).get('/checkin/children').set(plain.headers).expect(403);
    const other = await makeChurch('elsewhere');
    const outsider = await makeUser(other, 'ADMIN', 'out');
    await request(app).get(`/checkin/children/${s.child.id}`).set(outsider.headers).expect(404);
    expect((await request(app).get('/checkin/sessions').set(outsider.headers)).body.data).toEqual([]);
    await request(app).post('/checkin/sessions').set(outsider.headers).send({ childId: s.child.id, roomId: s.room.id }).expect(404);
  });
});
