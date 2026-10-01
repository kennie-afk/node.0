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

describe('optional fields can be cleared with null', () => {
  it('events', async () => {
    const made = await post('/events', { name: 'Sunday service', description: 'Main', startTime: '2026-10-04T09:00', endTime: '2026-10-04T11:00', location: 'Hall' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const cleared = await put(`/events/${made.body.id}`, { description: null, endTime: null, location: null, recurrencePattern: null });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    const again = (await get(`/events/${made.body.id}`)).body;
    expect(again.description).toBeNull();
    expect(again.endTime).toBeNull();
    expect(again.location).toBeNull();
    expect((await post('/events', { name: 'Open ended', startTime: '2026-10-05T09:00', endTime: null })).status).toBe(201);
    expect((await put(`/events/${made.body.id}`, { endTime: '2026-10-04T08:00', startTime: '2026-10-04T09:00' })).status).toBe(400);
  });

  it('sermons', async () => {
    const member = await post('/members', { firstName: 'Peter', lastName: 'Otieno' });
    const event = await post('/events', { name: 'Revival week', startTime: '2026-10-04T09:00' });
    const made = await post('/sermons', { title: 'Walking in faith', datePreached: '2026-10-04', speakerMemberId: member.body.id, eventId: event.body.id, passageReference: 'John 3:16', summary: 'x', audioUrl: 'https://example.org/a.mp3', notes: 'n' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const cleared = await put(`/sermons/${made.body.id}`, { speakerMemberId: null, eventId: null, passageReference: null, summary: null, audioUrl: null, videoUrl: null, notes: null });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    const again = (await get(`/sermons/${made.body.id}`)).body;
    for (const k of ['speakerMemberId', 'eventId', 'passageReference', 'summary', 'audioUrl', 'notes']) expect(again[k], k).toBeNull();
  });

  it('announcements', async () => {
    const made = await post('/announcements', { title: 'Harvest', content: 'Bring your gifts on Sunday', expiryDate: '2026-12-01T00:00:00.000Z', targetAudience: 'Members' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const cleared = await put(`/announcements/${made.body.id}`, { expiryDate: null, targetAudience: null });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    const again = (await get(`/announcements/${made.body.id}`)).body;
    expect(again.expiryDate).toBeNull();
    expect(again.targetAudience).toBeNull();
  });
});
