import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { inChurch, makeChurch, makeMember, makeUser } from './ops-helpers';
import { requestTx } from '../src/common/http';
import { enqueueMessage, processOutbox, processOutboxAllChurches } from '../src/modules/comms/comms.service';
import { AfricasTalkingSmsProvider, mockOutbox, setProviders } from '../src/modules/comms/providers';
import { select } from '../src/modules/finance/sql';

// A real Postgres under load truncates slowly; the defaults are tuned for in-memory SQLite.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const app = createApp();
let church: number;
let admin: { headers: { Authorization: string } };
let pastor: { headers: { Authorization: string } };

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  setProviders(null, null);
  mockOutbox.length = 0;
  delete process.env.COMMS_DAILY_CAP;
  church = await makeChurch('comms');
  admin = await makeUser(church, 'ADMIN', 'admin');
  pastor = await makeUser(church, 'PASTOR', 'pastor');
});

const api = (headers = admin.headers) => ({
  post: (url: string) => request(app).post(url).set(headers),
  get: (url: string) => request(app).get(url).set(headers)
});

async function audience() {
  const a = await makeMember(church, { firstName: 'Amina', lastName: 'Wanjiru', phoneNumber: '0712345678', email: 'amina@x.org' });
  const b = await makeMember(church, { firstName: 'Brian', lastName: 'Otieno', phoneNumber: '0722000111' });
  const c = await makeMember(church, { firstName: 'Carol', lastName: 'Njeri', phoneNumber: '0733000222' });
  const d = await makeMember(church, { firstName: 'Dan', lastName: 'Kiptoo' });
  return { a, b, c, d };
}

describe('campaigns', () => {
  it('queues only reachable, consenting members, renders the template, and sends through the provider', async () => {
    const m = await audience();
    await api().post(`/dataops/members/${m.c}/consents`).send({ purpose: 'COMMUNICATIONS', channel: 'SMS', granted: false }).expect(201);
    const tpl = await api().post('/comms/templates').send({ name: 'Welcome', channel: 'SMS', body: 'Hello {{firstName}}, see you Sunday' }).expect(201);
    const seg = await api().post('/comms/segments').send({ name: 'Everyone', definition: { type: 'ALL' } }).expect(201);

    const preview = await api().get(`/comms/segments/${seg.body.id}/preview?channel=SMS`).expect(200);
    expect(preview.body).toMatchObject({ total: 4, reachable: 2, optedOut: 1 });

    const campaign = await api().post('/comms/campaigns').send({ name: 'Sunday', channel: 'SMS', templateId: tpl.body.id, segmentId: seg.body.id }).expect(201);
    const sent = await api().post(`/comms/campaigns/${campaign.body.id}/send`).expect(200);
    expect(sent.body.recipientCount).toBe(2);
    expect(sent.body.delivery).toEqual({ QUEUED: 2, SKIPPED: 2 });
    await api().post(`/comms/campaigns/${campaign.body.id}/send`).expect(409);

    const skipped = await api().get('/comms/outbox?status=SKIPPED').expect(200);
    expect(skipped.body.data.map((r: any) => r.lastError).sort()).toEqual(['no address', 'opted out']);

    const result = await api().post('/comms/outbox/process').expect(200);
    expect(result.body).toEqual({ sent: 2, failed: 0, retried: 0 });
    expect(mockOutbox.map((x) => x.body).sort()).toEqual(['Hello Amina, see you Sunday', 'Hello Brian, see you Sunday']);
    expect(mockOutbox.map((x) => x.to).sort()).toEqual(['+254712345678', '+254722000111']);
    const after = await api().get(`/comms/campaigns/${campaign.body.id}`).expect(200);
    expect(after.body.status).toBe('COMPLETED');
    expect(after.body.delivery.SENT).toBe(2);
  });

  it('targets a ministry or small group, and never another church', async () => {
    const m = await audience();
    const ministry = await inChurch(church, () => db.Ministry.create({ churchId: church, name: 'Choir' }));
    await inChurch(church, () => db.MinistryMember.create({ churchId: church, ministryId: ministry.id, memberId: m.a }));
    const seg = await api().post('/comms/segments').send({ name: 'Choir', definition: { type: 'MINISTRY', ministryId: ministry.id } }).expect(201);
    expect((await api().get(`/comms/segments/${seg.body.id}/preview?channel=SMS`)).body.total).toBe(1);

    const other = await makeChurch('elsewhere');
    const outsider = await makeUser(other, 'ADMIN', 'outsider');
    await request(app).get(`/comms/segments/${seg.body.id}/preview`).set(outsider.headers).expect(404);
    await request(app).post('/comms/segments').set(outsider.headers).send({ name: 'Steal', definition: { type: 'MINISTRY', ministryId: ministry.id } }).expect(400);
    expect((await request(app).get('/comms/segments').set(outsider.headers)).body).toEqual([]);
  });

  it('retries a failing send with back-off and marks it FAILED after three attempts', async () => {
    const m = await audience();
    let calls = 0;
    setProviders({ send: async () => { calls += 1; throw new Error('gateway down'); } }, null);
    await inChurch(church, async () => enqueueMessage(await requestTx(), church, { channel: 'SMS', to: '0712345678', body: 'hi', memberId: m.a }));
    for (let round = 1; round <= 3; round += 1) {
      const r = await inChurch(church, async () => processOutbox(await requestTx(), church, 10));
      expect(r.sent).toBe(0);
      await inChurch(church, async () => select(await requestTx(), 'UPDATE outbox_messages SET not_before = ? RETURNING id', [new Date(Date.now() - 1000)]));
    }
    expect(calls).toBe(3);
    const row = (await inChurch(church, async () => select<any>(await requestTx(), 'SELECT status, attempts, last_error FROM outbox_messages')))[0];
    expect(row).toMatchObject({ status: 'FAILED', attempts: 3, last_error: 'gateway down' });
  });

  it('refuses a campaign that would exceed the church daily cap', async () => {
    await audience();
    process.env.COMMS_DAILY_CAP = '1';
    const seg = await api().post('/comms/segments').send({ name: 'Everyone', definition: { type: 'ALL' } });
    const campaign = await api().post('/comms/campaigns').send({ name: 'Big', channel: 'SMS', body: 'hello', segmentId: seg.body.id });
    const res = await api().post(`/comms/campaigns/${campaign.body.id}/send`);
    expect(res.status).toBe(429);
    expect((await api().get('/comms/outbox?status=QUEUED')).body.data).toHaveLength(0);
  });

  it('keeps messaging behind the comms:send permission', async () => {
    const member = await makeUser(church, 'MEMBER', 'plain');
    const treasurer = await makeUser(church, 'TREASURER', 'tess');
    expect((await request(app).get('/comms/templates').set(member.headers)).status).toBe(403);
    expect((await request(app).get('/comms/templates').set(treasurer.headers)).status).toBe(403);
    expect((await request(app).get('/comms/templates').set(pastor.headers)).status).toBe(200);
    expect((await request(app).post('/comms/outbox/process').set(pastor.headers)).status).toBe(403);
    expect((await request(app).get('/comms/templates')).status).toBe(401);
  });
});

describe('the outbox hook other modules use', () => {
  it('is idempotent on the dedupe key and respects a withdrawn consent', async () => {
    const m = await audience();
    const enqueue = (memberId: number, key: string) => inChurch(church, async () => enqueueMessage(await requestTx(), church, { channel: 'SMS', to: '0712345678', body: 'Receipt', memberId, dedupeKey: key }));
    expect(await enqueue(m.a, 'receipt-1')).toBeTruthy();
    expect(await enqueue(m.a, 'receipt-1')).toBeNull();
    await api().post(`/dataops/members/${m.b}/consents`).send({ purpose: 'COMMUNICATIONS', channel: 'ANY', granted: false });
    expect(await enqueue(m.b, 'receipt-2')).toBeNull();
  });

  it('drains every church with mail due, each in its own tenant transaction', async () => {
    const other = await makeChurch('second');
    const m1 = await makeMember(church, { phoneNumber: '0712000001' });
    const m2 = await makeMember(other, { phoneNumber: '0712000002' });
    await inChurch(church, async () => enqueueMessage(await requestTx(), church, { channel: 'SMS', to: '0712000001', body: 'one', memberId: m1 }));
    await inChurch(other, async () => enqueueMessage(await requestTx(), other, { channel: 'SMS', to: '0712000002', body: 'two', memberId: m2 }));
    const totals = await processOutboxAllChurches(10, 10);
    expect(totals).toMatchObject({ churches: 2, sent: 2, failed: 0 });
    expect(mockOutbox.map((x) => x.body).sort()).toEqual(['one', 'two']);
  });

  it.runIf(onPostgres)('lets two workers drain the same queue without sending anything twice', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 30; i += 1) ids.push(await makeMember(church, { phoneNumber: `07120001${String(i).padStart(2, '0')}` }));
    for (const id of ids) await inChurch(church, async () => enqueueMessage(await requestTx(), church, { channel: 'SMS', to: '0712000100', body: `m${id}`, memberId: id }));
    await Promise.all([processOutboxAllChurches(30, 5), processOutboxAllChurches(30, 5), processOutboxAllChurches(30, 5)]);
    expect(mockOutbox).toHaveLength(30);
    expect(new Set(mockOutbox.map((x) => x.body)).size).toBe(30);
  });
});

describe("Africa's Talking provider", () => {
  const okBody = JSON.stringify({ SMSMessageData: { Message: 'Sent to 1/1', Recipients: [{ statusCode: 101, status: 'Success', messageId: 'ATXid_1', number: '+254712345678' }] } });
  const make = (respond: () => { ok: boolean; status: number; body: string }, seen: any[] = []) =>
    new AfricasTalkingSmsProvider({ username: 'sandbox', apiKey: 'key', senderId: 'CHURCH', fetchImpl: async (url, init) => { seen.push({ url, init }); const r = respond(); return { ok: r.ok, status: r.status, text: async () => r.body }; } });

  it('posts the documented form with the api key header and returns the message id', async () => {
    const seen: any[] = [];
    const result = await make(() => ({ ok: true, status: 201, body: okBody }), seen).send('+254712345678', 'Hello');
    expect(result.providerRef).toBe('ATXid_1');
    expect(seen[0].url).toBe('https://api.africastalking.com/version1/messaging');
    expect(seen[0].init.headers.apiKey).toBe('key');
    const form = new URLSearchParams(seen[0].init.body);
    expect(Object.fromEntries(form)).toEqual({ username: 'sandbox', to: '+254712345678', message: 'Hello', from: 'CHURCH' });
  });

  it('treats a rejected recipient, an HTTP error and a non-JSON reply as failures', async () => {
    const rejected = JSON.stringify({ SMSMessageData: { Recipients: [{ statusCode: 403, status: 'InvalidPhoneNumber' }] } });
    await expect(make(() => ({ ok: true, status: 201, body: rejected })).send('+2547', 'x')).rejects.toThrow(/InvalidPhoneNumber/);
    await expect(make(() => ({ ok: false, status: 401, body: 'nope' })).send('+254712345678', 'x')).rejects.toThrow(/HTTP 401/);
    await expect(make(() => ({ ok: true, status: 200, body: '<html>' })).send('+254712345678', 'x')).rejects.toThrow(/not JSON/);
  });
});
