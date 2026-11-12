import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { makeChurch, makeMember, makeUser } from './ops-helpers';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const app = createApp();
let a: number; let b: number;
let adminA: { headers: { Authorization: string } }; let adminB: { headers: { Authorization: string } };
let viewerA: { headers: { Authorization: string } };

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  a = await makeChurch('qr-a'); b = await makeChurch('qr-b');
  adminA = await makeUser(a, 'ADMIN', 'adm-a'); adminB = await makeUser(b, 'ADMIN', 'adm-b');
  viewerA = await makeUser(a, 'MEMBER', 'viewer');
});

const get = (u: string, h = adminA.headers) => request(app).get(u).set(h);
const scan = (body: object, h = adminA.headers) => request(app).post('/attendance-qr/scan').set(h).send(body);

describe('member QR attendance', () => {
  it('issues a card, scans it into attendance, and refuses a second scan for the same day', async () => {
    const id = await makeMember(a, { firstName: 'Wanjiku', lastName: 'Kamau' });
    const card = (await get(`/attendance-qr/members/${id}`).expect(200)).body;
    expect(card.token).toMatch(/^hq1\.\d+\.\d+\.[\w-]{22}$/);
    expect(card.token).not.toContain('Wanjiku');
    const first = await scan({ token: card.token }).expect(200);
    expect(first.body).toMatchObject({ status: 'RECORDED', member: { id, name: 'Wanjiku Kamau' } });
    const again = await scan({ token: card.token }).expect(200);
    expect(again.body).toMatchObject({ status: 'ALREADY', attendanceId: first.body.attendanceId });
    const rows = (await get('/attendance').expect(200)).body.data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ memberId: id, attendanceType: 'In-person' });
  });

  it('a new day is a new record', async () => {
    const id = await makeMember(a);
    const token = (await get(`/attendance-qr/members/${id}`)).body.token;
    expect((await scan({ token, date: '2026-10-04' })).body.status).toBe('RECORDED');
    expect((await scan({ token, date: '2026-10-05' })).body.status).toBe('RECORDED');
  });

  it('rejects forged, tampered and other-church codes', async () => {
    const id = await makeMember(a);
    const idB = await makeMember(b);
    const token = (await get(`/attendance-qr/members/${id}`)).body.token as string;
    const tampered = token.replace(`.${id}.`, `.${id + 1}.`);
    await scan({ token: tampered }).expect(400);
    await scan({ token: 'hq1.1.1.AAAAAAAAAAAAAAAAAAAAAA' }).expect(400);
    await scan({ token: 'garbage-garbage' }).expect(400);
    const tokenB = (await get(`/attendance-qr/members/${idB}`, adminB.headers)).body.token;
    await scan({ token: tokenB }).expect(400);
    expect((await get('/attendance')).body.data).toHaveLength(0);
  });

  it('needs write permission to scan, and cannot read another church\'s member card', async () => {
    const id = await makeMember(a);
    const token = (await get(`/attendance-qr/members/${id}`)).body.token;
    await scan({ token }, viewerA.headers).expect(403);
    await request(app).post('/attendance-qr/scan').send({ token }).expect(401);
    await get(`/attendance-qr/members/${id}`, adminB.headers).expect(404);
  });

  it('lists printable cards, paged', async () => {
    for (let i = 0; i < 3; i += 1) await makeMember(a);
    const page = (await get('/attendance-qr/cards?limit=2')).body;
    expect(page).toHaveLength(2);
    const next = (await get(`/attendance-qr/cards?after=${page[1].memberId}&limit=2`)).body;
    expect(next).toHaveLength(1);
  });
});
