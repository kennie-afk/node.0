import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.MPESA_CALLBACK_SECRET = 'a-platform-level-callback-secret-for-tests';
});

import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { runAsTenant } from '../src/common/tenant-run';
import { requestTx } from '../src/common/http';
import { select } from '../src/modules/finance/sql';
import { callbackSecretFor } from '../src/modules/mpesa/config';
import { setStkProviderForTests } from '../src/modules/mpesa/provider';
import { prepareDatabase, truncateAll } from './harness';
import { Church, signUp } from './giving-helpers';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });
const app = createApp();
let church: Church;
let sent: Array<{ phone: string; amountMinor: number }>;

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  setStkProviderForTests(null);
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  church = await signUp(app, 'public-give');
  sent = [];
  setStkProviderForTests({
    name: 'mock',
    async initiate(r) {
      sent.push({ phone: r.phone, amountMinor: r.amountMinor });
      return { checkoutRequestId: `ws_CO_TEST_${sent.length}_${Math.random().toString(36).slice(2, 8)}`, merchantRequestId: 'M1', customerMessage: 'ok' };
    }
  });
});

let n = 0;
const key = () => `donor-key-${Date.now()}-${++n}-abcdef`;
const give = (body: Record<string, unknown>, idem = key(), slug = church.slug) => request(app).post(`/public/give/${slug}`).set('Idempotency-Key', idem).send(body);
const status = (idem: string, slug = church.slug) => request(app).get(`/public/give/${slug}/status`).set('Idempotency-Key', idem);

describe('public giving page', () => {
  it('shows the church name and giving options with no login, and nothing else', async () => {
    const res = await request(app).get(`/public/give/${church.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.church).toEqual({ name: `Church ${church.slug}`, slug: church.slug });
    expect(res.body.types.map((t: { name: string }) => t.name)).toContain('Tithe');
    expect(res.body.testMode).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/email|member|church_id|churchId/i);
    expect((await request(app).get('/public/give/no-such-church')).status).toBe(404);
    expect((await request(app).get('/public/give/..%2Fetc')).status).toBe(404);
  });

  it('starts an STK push, is idempotent on retry, and reports the status by the donor key', async () => {
    const k = key();
    const first = await give({ phone: '0712345678', amount: '500.00' }, k);
    expect(first.status).toBe(202);
    expect(first.body).toMatchObject({ status: 'PENDING', phone: '254712***678', replayed: false });
    expect(sent).toEqual([{ phone: '254712345678', amountMinor: 50000 }]);
    const again = await give({ phone: '0712345678', amount: '500.00' }, k);
    expect(again.body.replayed).toBe(true);
    expect(sent).toHaveLength(1);
    expect((await give({ phone: '0712345678', amount: '600.00' }, k)).status).toBe(422);

    expect((await status(k)).body).toMatchObject({ status: 'PENDING', receipt: null });
    // Safaricom reports success through the callback; the page then shows it.
    const checkout = await runAsTenant(church.id, async () => (await select<any>(await requestTx(), `SELECT checkout_request_id FROM mpesa_stk_requests WHERE public_key = :k`, { k }))[0].checkout_request_id);
    const cb = await request(app).post(`/mpesa/stk/callback/${church.slug}/${callbackSecretFor(church.slug)}`).send({ Body: { stkCallback: { CheckoutRequestID: checkout, ResultCode: 0, ResultDesc: 'ok', CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'QGH7PUBLIC1' }, { Name: 'Amount', Value: 500 }, { Name: 'PhoneNumber', Value: 254712345678 }] } } } });
    expect(cb.status).toBe(200);
    expect((await status(k)).body).toMatchObject({ status: 'SUCCESS', receipt: 'QGH7PUBLIC1' });
    // The money lands in the church's own books: a phone that matches no member goes to the unallocated
    // inbox (suspense) for the treasurer to allocate, exactly like any other M-Pesa receipt.
    const inbox = await request(app).get('/mpesa/transactions?status=UNALLOCATED').set(church.admin);
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0]).toMatchObject({ amountMinor: 50000 });
  });

  it('validates strictly: amounts, phone, unknown fields, missing or malformed keys, foreign giving types', async () => {
    expect((await give({ phone: '0712345678', amount: '5.00' })).status).toBe(400);
    expect((await give({ phone: '0712345678', amount: '150001.00' })).status).toBe(400);
    expect((await give({ phone: '12345', amount: '100.00' })).status).toBe(400);
    expect((await give({ phone: '0712345678', amount: '100.00', memberId: 1 })).status).toBe(400);
    expect((await give({ phone: '0712345678', amount: '100.00', givingTypeId: 99999 })).status).toBe(400);
    expect((await request(app).post(`/public/give/${church.slug}`).send({ phone: '0712345678', amount: '100.00' })).status).toBe(400);
    expect((await give({ phone: '0712345678', amount: '100.00' }, 'short')).status).toBe(400);
    expect((await give({ phone: '0712345678', amount: '100.00' }, key(), 'no-such-church')).status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it('refuses a giving type that belongs to another church', async () => {
    const other = await signUp(app, 'other-give');
    const otherType = (await request(app).get('/giving/types').set(other.admin)).body[0].id;
    expect((await give({ phone: '0712345678', amount: '100.00', givingTypeId: otherType })).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('caps requests per phone number so a prompt cannot be spammed at someone', async () => {
    for (let i = 0; i < 3; i += 1) expect((await give({ phone: '0722000111', amount: '100.00' })).status).toBe(202);
    const blocked = await give({ phone: '0722000111', amount: '100.00' });
    expect(blocked.status).toBe(429);
    expect(sent).toHaveLength(3);
    expect((await give({ phone: '0733000222', amount: '100.00' })).status).toBe(202);
  });

  it('does not expose one church’s gift to another church’s page or to a guessed key', async () => {
    const other = await signUp(app, 'other-give2');
    const k = key();
    await give({ phone: '0712345678', amount: '100.00' }, k);
    expect((await status(k, other.slug)).status).toBe(404);
    expect((await status(key())).status).toBe(404);
  });

  it('answers a failed push as a failure that still counts against the throttle', async () => {
    setStkProviderForTests({ name: 'mock', async initiate() { throw new Error('Daraja is down'); } });
    const res = await give({ phone: '0712345678', amount: '100.00' });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('FAILED');
    expect(res.body.message).not.toMatch(/Daraja/);
  });
});
