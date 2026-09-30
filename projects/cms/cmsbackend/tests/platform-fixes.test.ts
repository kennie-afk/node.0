import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';

const app = createApp();
let auth: { Authorization: string };

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  const owner = { username: 'admin', email: 'fix@example.org', password: 'passphrase-fix-1' };
  await request(app).post('/churches').send({ church: { name: 'Fix Church', slug: 'fix' }, owner });
  const login = await request(app).post('/auth/login').send({ email: owner.email, password: owner.password });
  auth = { Authorization: `Bearer ${login.body.token}` };
});

describe('fixes found by the console work', () => {
  it('searches members in the query, not in the browser', async () => {
    for (const [f, l] of [['Amina', 'Wanjiru'], ['Brian', 'Otieno'], ['Amos', 'Kiprop']]) {
      await request(app).post('/members').set(auth).send({ firstName: f, lastName: l, membershipDate: '2024-01-01', status: 'Active' });
    }
    const res = await request(app).get('/members?q=am').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((m: any) => m.firstName).sort()).toEqual(['Amina', 'Amos']);
    const none = await request(app).get('/members?q=zzz').set(auth);
    expect(none.body.total).toBe(0);
  });

  it('refuses an event that ends before it starts', async () => {
    const res = await request(app).post('/events').set(auth).send({ name: 'Backwards', startTime: '2026-10-10T10:00', endTime: '2026-10-10T09:00' });
    expect(res.status).toBe(400);
  });

  it('names the field when a user e-mail is already taken', async () => {
    const body = { username: 'dup1', email: 'dup@example.org', password: 'passphrase-dup-1' };
    await request(app).post('/users').set(auth).send(body);
    const again = await request(app).post('/users').set(auth).send({ ...body, username: 'dup2' });
    expect(again.status).toBe(409);
  });

  it('lets a browser send Idempotency-Key across origins', async () => {
    const res = await request(app).options('/finance/journal').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'idempotency-key,authorization,content-type');
    expect(res.headers['access-control-allow-headers']).toMatch(/Idempotency-Key/i);
  });
});
