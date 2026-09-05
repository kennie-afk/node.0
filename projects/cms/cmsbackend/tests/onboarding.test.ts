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
  for (const model of [db.Member, db.Family, db.User, db.Church]) {
    await model.destroy({ where: {}, truncate: true, cascade: true });
  }
});

const payload = {
  church: { name: 'Grace Chapel', slug: 'grace-chapel' },
  owner: { username: 'pastor', email: 'pastor@grace.example', password: 'a-strong-passphrase' }
};

describe('a brand new church can get itself running', () => {
  it('creates the church and its first administrator', async () => {
    const response = await request(app).post('/churches').send(payload);

    expect(response.status).toBe(201);
    expect(response.body.church.slug).toBe('grace-chapel');
    expect(response.body.owner.email).toBe('pastor@grace.example');
    expect(response.body.owner).not.toHaveProperty('password_hash');
  });

  it('lets that administrator log in and receive a church-scoped token', async () => {
    await request(app).post('/churches').send(payload);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: payload.owner.email, password: payload.owner.password });

    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.churchId).toBeGreaterThan(0);
  });

  it('lets the administrator immediately create and list members', async () => {
    await request(app).post('/churches').send(payload);
    const login = await request(app)
      .post('/auth/login')
      .send({ email: payload.owner.email, password: payload.owner.password });

    const auth = { Authorization: `Bearer ${login.body.token}` };

    const created = await request(app)
      .post('/members')
      .set(auth)
      .send({ firstName: 'Amina', lastName: 'Wanjiru', gender: 'Female' });

    expect(created.status).toBe(201);

    const list = await request(app).get('/members').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data).toHaveLength(1);
  });

  it('refuses a duplicate slug', async () => {
    await request(app).post('/churches').send(payload);
    const again = await request(app).post('/churches').send(payload);
    expect(again.status).toBe(409);
  });

  it('refuses a weak first password', async () => {
    const weak = { ...payload, owner: { ...payload.owner, password: 'short' } };
    expect((await request(app).post('/churches').send(weak)).status).toBe(400);
  });
});

describe('routes that must not be open to the public', () => {
  it('refuses anonymous user creation', async () => {
    const response = await request(app)
      .post('/users')
      .send({ username: 'sneak', email: 'sneak@x.com', password: 'a-strong-passphrase' });

    expect(response.status).toBe(401);
  });

  it('refuses anonymous member listing', async () => {
    expect((await request(app).get('/members')).status).toBe(401);
  });

  it('answers health without a token or a database round trip', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
  });
});
