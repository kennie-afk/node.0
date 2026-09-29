import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';

const app = createApp();

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
});

afterAll(async () => {
  await db.sequelize.close();
});

beforeEach(async () => {
  for (const model of [
    db.Attendance, db.Contribution, db.Sermon, db.Event, db.Ministry, db.Member,
    db.Family, db.User, db.Church
  ]) {
    await model.destroy({ where: {}, truncate: true, cascade: true });
  }
});

async function church(slug: string) {
  const owner = { username: 'admin', email: `${slug}@example.org`, password: `passphrase-${slug}` };
  await request(app).post('/churches').send({ church: { name: `Church ${slug}`, slug }, owner });
  const login = await request(app).post('/auth/login').send({ email: owner.email, password: owner.password });
  return { Authorization: `Bearer ${login.body.token}` };
}

async function plainUser(admin: { Authorization: string }, name: string) {
  const created = await request(app)
    .post('/users')
    .set(admin)
    .send({ username: name, email: `${name}@example.org`, password: `passphrase-${name}` });
  const login = await request(app)
    .post('/auth/login')
    .send({ email: `${name}@example.org`, password: `passphrase-${name}` });
  return { id: created.body.id as number, auth: { Authorization: `Bearer ${login.body.token}` } };
}

describe('a signed-in member cannot take over the church', () => {
  it('refuses self-promotion to administrator', async () => {
    const admin = await church('grace');
    const member = await plainUser(admin, 'mary');
    const res = await request(app).put(`/users/${member.id}`).set(member.auth).send({ isAdmin: true });
    expect(res.status).toBe(403);
  });

  it('refuses rewriting another user\'s password', async () => {
    const admin = await church('grace');
    const member = await plainUser(admin, 'mary');
    const me = await request(app).get('/auth/profile').set(admin);
    const res = await request(app)
      .put(`/users/${me.body.id}`)
      .set(member.auth)
      .send({ password: 'hijacked-password' });
    expect(res.status).toBe(403);
  });

  it('still lets a member change their own password, and an admin manage anyone', async () => {
    const admin = await church('grace');
    const member = await plainUser(admin, 'mary');
    expect((await request(app).put(`/users/${member.id}`).set(member.auth).send({ password: 'a-new-passphrase' })).status).toBe(200);
    expect((await request(app).put(`/users/${member.id}`).set(admin).send({ isAdmin: true })).status).toBe(200);
  });

  it('keeps individual giving records admin-only', async () => {
    const admin = await church('grace');
    const member = await plainUser(admin, 'mary');
    const person = await request(app).post('/members').set(admin).send({ firstName: 'Amina', lastName: 'Wanjiru' });
    const gift = await request(app)
      .post('/contributions')
      .set(admin)
      .send({ memberId: person.body.id, amount: 500, date: '2026-09-29T00:00:00Z' });
    expect(gift.status).toBe(201);
    expect(gift.body.contributionType).toBe('Offering');
    expect((await request(app).get(`/contributions/${gift.body.id}`).set(member.auth)).status).toBe(403);
  });
});

describe('churches are isolated from each other', () => {
  it('rejects a reference to another church\'s member', async () => {
    const one = await church('one');
    const two = await church('two');
    const person = await request(app).post('/members').set(one).send({ firstName: 'Jane', lastName: 'Otieno' });

    const gift = await request(app)
      .post('/contributions')
      .set(two)
      .send({ memberId: person.body.id, amount: 5, date: '2026-09-29T00:00:00Z', contributionType: 'Tithe' });
    expect(gift.status).toBe(400);

    const ministry = await request(app).post('/ministries').set(two).send({ name: 'Ushers', leaderId: person.body.id });
    expect(ministry.status).toBe(400);
    expect(JSON.stringify(ministry.body)).not.toContain('Jane');
  });

  it('lets two churches use the same family and ministry names, but not one church twice', async () => {
    const one = await church('one');
    const two = await church('two');
    expect((await request(app).post('/families').set(one).send({ familyName: 'Otieno family' })).status).toBe(201);
    expect((await request(app).post('/families').set(two).send({ familyName: 'Otieno family' })).status).toBe(201);
    const again = await request(app).post('/families').set(one).send({ familyName: 'Otieno family' });
    expect(again.status).toBe(409);
    expect(again.body.message).toContain('family_name');
  });
});

describe('attendance input is validated', () => {
  it('returns 400 rather than 500 for a malformed record', async () => {
    const admin = await church('grace');
    const res = await request(app)
      .post('/attendance')
      .set(admin)
      .send({ guestName: 'Visitor', attendanceDate: 'nonsense', attendanceType: 'Bogus' });
    expect(res.status).toBe(400);
  });
});
