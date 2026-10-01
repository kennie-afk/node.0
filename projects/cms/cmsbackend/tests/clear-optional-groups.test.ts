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
  admin = (await signUp(app, 'clear')).admin;
});

const post = (path: string, body: object) => request(app).post(path).set(admin).send(body);
const put = (path: string, body: object) => request(app).put(path).set(admin).send(body);
const get = (path: string) => request(app).get(path).set(admin);

// The shared form sends null for a blank optional field, so a stored value can be removed again.
describe('optional fields of families, ministries and small groups can be cleared with null', () => {
  it('families', async () => {
    const made = await post('/families', { familyName: 'Omondi', city: 'Kisumu', email: 'o@example.org', notes: 'x', headOfFamilyMemberId: null });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const cleared = await put(`/families/${made.body.id}`, { city: null, email: null, notes: null, phoneNumber: null });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    const again = (await get(`/families/${made.body.id}`)).body;
    expect(again.city).toBeNull();
    expect(again.email).toBeNull();
    expect(again.notes).toBeNull();
  });

  it('ministries', async () => {
    const leader = await post('/members', { firstName: 'Wanjiku', lastName: 'Kamau' });
    const made = await post('/ministries', { name: 'Worship team', description: 'Music', leaderId: leader.body.id });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const cleared = await put(`/ministries/${made.body.id}`, { description: null, leaderId: null });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    const again = (await get(`/ministries/${made.body.id}`)).body;
    expect(again.description).toBeNull();
    expect(again.leaderId).toBeNull();
    expect((await post('/ministries', { name: 'Youth', description: null, leaderId: null })).status).toBe(201);
  });

  it('small groups', async () => {
    const ministry = await post('/ministries', { name: 'Youth' });
    const made = await post('/small-groups', { name: 'Tuesday group', ministryId: ministry.body.id, meetingDay: 'Tuesday', meetingTime: '18:30', meetingLocation: 'Hall', description: 'd' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const cleared = await put(`/small-groups/${made.body.id}`, { meetingDay: null, meetingTime: null, meetingLocation: null, description: null, leaderId: null });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    const again = (await get(`/small-groups/${made.body.id}`)).body;
    expect(again.meetingDay).toBeNull();
    expect(again.meetingTime).toBeNull();
    expect(again.meetingLocation).toBeNull();
    expect(again.description).toBeNull();
  });
});
