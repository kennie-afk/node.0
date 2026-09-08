import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';

const app = createApp();

const payload = {
  church: { name: 'Grace Chapel', slug: 'grace-chapel' },
  owner: { username: 'pastor', email: 'pastor@grace.example', password: 'a-strong-passphrase' }
};

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
});

afterAll(async () => {
  await db.sequelize.close();
});

beforeEach(async () => {
  const models = [
    db.SmallGroupMember,
    db.SmallGroup,
    db.MinistryMember,
    db.Ministry,
    db.Member,
    db.Family,
    db.User,
    db.Church
  ];
  for (const model of models) {
    await model.destroy({ where: {}, truncate: true, cascade: true });
  }
});

async function signIn() {
  await request(app).post('/churches').send(payload);
  const login = await request(app)
    .post('/auth/login')
    .send({ email: payload.owner.email, password: payload.owner.password });
  return { Authorization: `Bearer ${login.body.token}` };
}

describe('a ministry roster can be built through the API the console calls', () => {
  it('adds a member, lists them with their person and role, then removes them', async () => {
    const auth = await signIn();

    const member = await request(app)
      .post('/members')
      .set(auth)
      .send({ firstName: 'Amina', lastName: 'Wanjiru', gender: 'Female' });

    const ministry = await request(app)
      .post('/ministries')
      .set(auth)
      .send({ name: 'Worship Team', description: 'Sunday music' });

    expect(ministry.status).toBe(201);

    const added = await request(app)
      .post(`/ministries/${ministry.body.id}/members`)
      .set(auth)
      .send({ memberId: member.body.id, role: 'Vocalist' });

    expect(added.status).toBeLessThan(300);

    const roster = await request(app)
      .get(`/ministries/${ministry.body.id}/members`)
      .set(auth);

    expect(roster.status).toBe(200);
    expect(roster.body.data).toHaveLength(1);
    expect(roster.body.data[0].memberId).toBe(member.body.id);
    expect(roster.body.data[0].role).toBe('Vocalist');
    expect(roster.body.data[0].member.firstName).toBe('Amina');

    const removed = await request(app)
      .delete(`/ministries/${ministry.body.id}/members`)
      .set(auth)
      .send({ memberId: member.body.id });

    expect(removed.status).toBeLessThan(300);

    const after = await request(app).get(`/ministries/${ministry.body.id}/members`).set(auth);
    expect(after.body.data).toHaveLength(0);
  });

  it('reports the offending field when the membership request is malformed', async () => {
    const auth = await signIn();

    const ministry = await request(app)
      .post('/ministries')
      .set(auth)
      .send({ name: 'Worship Team' });

    const response = await request(app)
      .post(`/ministries/${ministry.body.id}/members`)
      .set(auth)
      .send({ memberId: 'not-a-number' });

    expect(response.status).toBe(400);
    expect(response.body.errors[0].field).toBe('body.memberId');
  });
});

describe('a small group roster can be built through the API the console calls', () => {
  it('adds a member by path, lists them with their person, then removes them', async () => {
    const auth = await signIn();

    const member = await request(app)
      .post('/members')
      .set(auth)
      .send({ firstName: 'Brian', lastName: 'Otieno', gender: 'Male' });

    const ministry = await request(app)
      .post('/ministries')
      .set(auth)
      .send({ name: 'Discipleship' });

    const group = await request(app)
      .post('/small-groups')
      .set(auth)
      .send({ name: 'Tuesday Cell', ministryId: ministry.body.id });

    expect(group.status).toBe(201);

    const added = await request(app)
      .post(`/small-groups/${group.body.id}/members/${member.body.id}`)
      .set(auth)
      .send({ role: 'Host' });

    expect(added.status).toBeLessThan(300);

    const roster = await request(app).get(`/small-groups/${group.body.id}/members`).set(auth);

    expect(roster.status).toBe(200);
    expect(roster.body.data).toHaveLength(1);
    expect(roster.body.data[0].memberId).toBe(member.body.id);
    expect(roster.body.data[0].member.firstName).toBe('Brian');

    const removed = await request(app)
      .delete(`/small-groups/${group.body.id}/members/${member.body.id}`)
      .set(auth);

    expect(removed.status).toBeLessThan(300);

    const after = await request(app).get(`/small-groups/${group.body.id}/members`).set(auth);
    expect(after.body.data).toHaveLength(0);
  });
});
