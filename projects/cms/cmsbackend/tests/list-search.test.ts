import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { signUp } from './giving-helpers';

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
  admin = (await signUp(app, 'search')).admin;
});

const post = (path: string, body: object) => request(app).post(path).set(admin).send(body);
const search = (path: string, q: string, extra = '') => request(app).get(`${path}?q=${encodeURIComponent(q)}${extra}`).set(admin);

describe('server-side search on the older list endpoints', () => {
  it('finds a record beyond the first page, which the old screens could never show', async () => {
    for (let i = 0; i < 30; i++) await post('/families', { familyName: `Family ${String(i).padStart(2, '0')}` });
    await post('/families', { familyName: 'Omondi', city: 'Kisumu' });
    const all = await request(app).get('/families').set(admin);
    expect(all.body.total).toBe(31);
    expect(all.body.data).toHaveLength(25);
    const found = await search('/families', 'omondi');
    expect(found.body.total).toBe(1);
    expect(found.body.data[0].familyName).toBe('Omondi');
    expect((await search('/families', 'kisumu')).body.total).toBe(1);
  });

  it('searches names and titles across modules and ignores wildcards', async () => {
    await post('/ministries', { name: 'Worship team', description: 'Music' });
    await post('/ministries', { name: 'Youth', description: 'Teens' });
    expect((await search('/ministries', 'worship')).body.total).toBe(1);
    expect((await search('/ministries', 'teens')).body.total).toBe(1);
    expect((await search('/ministries', '%')).body.total).toBe(2);
    expect((await search('/ministries', 'zzzz')).body.total).toBe(0);
  });

  it('searches users by name or email, and never across churches', async () => {
    await post('/users', { username: 'bernard', email: 'bernard@example.org', password: 'passphrase-1', role: 'MEMBER' });
    const other = (await signUp(app, 'elsewhere')).admin;
    await request(app).post('/users').set(other).send({ username: 'bernard2', email: 'b2@example.org', password: 'passphrase-2', role: 'MEMBER' });
    const mine = await search('/users', 'bern');
    expect(mine.body.total).toBe(1);
    expect(mine.body.data[0].username).toBe('bernard');
  });

  it('lets a member\'s optional details be cleared again, not only set', async () => {
    const made = await post('/members', { firstName: 'Wanjiku', lastName: 'Kamau', email: 'w@example.org', phoneNumber: '0712345678', gender: 'Female' });
    expect(made.status).toBe(201);
    const cleared = await request(app).put(`/members/${made.body.id}`).set(admin).send({ email: null, phoneNumber: null, gender: null });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    const again = await request(app).get(`/members/${made.body.id}`).set(admin);
    expect(again.body.email).toBeNull();
    expect(again.body.phoneNumber).toBeNull();
  });
});
