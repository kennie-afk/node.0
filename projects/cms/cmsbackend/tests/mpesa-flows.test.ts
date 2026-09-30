import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Must be set before the app (and its env module) loads.
vi.hoisted(() => {
  process.env.MPESA_CALLBACK_SECRET = 'a-platform-level-callback-secret-for-tests';
});

import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { callbackSecretFor } from '../src/modules/mpesa/config';
import { normalisePhone } from '../src/modules/mpesa/phone';
import { DarajaStkProvider, HttpClient } from '../src/modules/mpesa/provider';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { Church, balanceOf, books, member, signUp, userWithRole } from './giving-helpers';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });
const app = createApp();
let church: Church;
let auth: { Authorization: string };

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  church = await signUp(app, 'mpesa-church');
  auth = church.admin;
});

const confirmation = (slug = church?.slug, secret = callbackSecretFor(slug)) => `/mpesa/c2b/confirmation/${slug}/${secret}`;
const payload = (over: Record<string, unknown> = {}) => ({
  TransactionType: 'Pay Bill',
  TransID: `QGH${Math.floor(Math.random() * 1e7)}X`,
  TransTime: '20260930101500',
  TransAmount: '1500.00',
  BusinessShortCode: '600000',
  BillRefNumber: 'TITHE',
  MSISDN: '254712345678',
  FirstName: 'Amina',
  LastName: 'Wanjiru',
  ...over
});

describe('phone numbers', () => {
  it.each([
    ['0712345678', '254712345678'],
    ['+254 712 345 678', '254712345678'],
    ['254712345678', '254712345678'],
    ['712345678', '254712345678'],
    ['0112345678', '254112345678']
  ])('normalises %s', (raw, expected) => expect(normalisePhone(raw)).toBe(expected));
  it.each(['', '12345', '0212345678', null, 'abc'])('rejects %s', (raw) => expect(normalisePhone(raw as string)).toBeNull());
});

describe('C2B confirmations', () => {
  it('posts a payment from a known member straight to income, once, however often Safaricom retries', async () => {
    const who = await member(app, auth, 'Amina', 'Wanjiru', '0712345678');
    const body = payload({ TransID: 'RKT1A2B3C4' });
    const first = await request(app).post(confirmation()).send(body);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    for (let i = 0; i < 3; i += 1) expect((await request(app).post(confirmation()).send(body)).status).toBe(200);

    const inbox = (await request(app).get('/mpesa/transactions').set(auth)).body.data;
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ transId: 'RKT1A2B3C4', status: 'MATCHED', memberId: who, amount: '1500.00', msisdn: '254712345678' });
    const gifts = (await request(app).get('/giving/contributions').set(auth)).body.data;
    expect(gifts).toHaveLength(1);
    expect(gifts[0]).toMatchObject({ contributionType: 'Tithe', source: 'MPESA', transactionId: 'RKT1A2B3C4', paymentMethod: 'M-Pesa', receiptNo: 'RCT-000001', date: '2026-09-30' });
    expect(await balanceOf(app, auth, '1110')).toEqual({ debit: '1500.00', credit: '0.00' });
    expect(await balanceOf(app, auth, '4010')).toEqual({ debit: '0.00', credit: '1500.00' });
    expect(await balanceOf(app, auth, '2020')).toBeNull();
  });

  it('identifies the member from the bill reference when the phone is unknown', async () => {
    const who = await member(app, auth, 'Brian', 'Otieno');
    await request(app).post(confirmation()).send(payload({ TransID: 'REF0000001', MSISDN: 'hashed-by-safaricom', BillRefNumber: `Missions M${who}`, TransAmount: '300' }));
    const gift = (await request(app).get('/giving/contributions').set(auth)).body.data[0];
    expect(gift).toMatchObject({ memberId: who, contributionType: 'Missions', fundCode: 'MIS' });
  });

  it('parks an unknown payer in suspense and lets the treasurer allocate it later', async () => {
    const treasurer = await userWithRole(app, auth, 'tess', 'TREASURER');
    await request(app).post(confirmation()).send(payload({ TransID: 'UNK0000001', MSISDN: '254799000111', BillRefNumber: 'hello', TransAmount: '2000' }));
    const row = (await request(app).get('/mpesa/transactions?status=UNALLOCATED').set(auth)).body.data[0];
    expect(row).toMatchObject({ status: 'UNALLOCATED', amount: '2000.00' });
    expect(await balanceOf(app, auth, '1110')).toEqual({ debit: '2000.00', credit: '0.00' });
    expect(await balanceOf(app, auth, '2020')).toEqual({ debit: '0.00', credit: '2000.00' });
    expect(await balanceOf(app, auth, '4010')).toBeNull();
    expect((await request(app).get('/giving/contributions').set(auth)).body.data).toHaveLength(0);

    const who = await member(app, auth, 'Carol', 'Mwangi');
    const types = (await request(app).get('/giving/types').set(auth)).body;
    const tithe = types.find((t: any) => t.code === 'TITHE').id;
    const done = await request(app).post(`/mpesa/transactions/${row.id}/allocate`).set(treasurer).send({ memberId: who, givingTypeId: tithe });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ memberId: who, amount: '2000.00', source: 'MPESA', transactionId: 'UNK0000001', contributionType: 'Tithe' });
    expect(await balanceOf(app, auth, '2020')).toBeNull();
    expect(await balanceOf(app, auth, '4010')).toEqual({ debit: '0.00', credit: '2000.00' });
    expect(await balanceOf(app, auth, '1110')).toEqual({ debit: '2000.00', credit: '0.00' });
    expect((await request(app).post(`/mpesa/transactions/${row.id}/allocate`).set(treasurer).send({ memberId: who, givingTypeId: tithe })).status).toBe(409);
    expect((await request(app).get('/mpesa/transactions?status=ALLOCATED').set(auth)).body.data).toHaveLength(1);
    expect((await request(app).get('/finance/integrity').set(auth)).body.ok).toBe(true);
  });

  it('can allocate a suspense receipt into a different fund without moving any cash', async () => {
    await request(app).post(confirmation()).send(payload({ TransID: 'UNK0000002', MSISDN: '254700000000', BillRefNumber: 'x', TransAmount: '1000' }));
    const row = (await request(app).get('/mpesa/transactions?status=UNALLOCATED').set(auth)).body.data[0];
    const { fund } = await books(app, auth);
    const types = (await request(app).get('/giving/types').set(auth)).body;
    const building = types.find((t: any) => t.code === 'BUILDING').id;
    const done = await request(app).post(`/mpesa/transactions/${row.id}/allocate`).set(auth).send({ givingTypeId: building, fundId: fund('BLD'), contributorName: 'Walk-in donor' });
    expect(done.status).toBe(200);
    expect(done.body.fundId).toBe(fund('BLD'));
    const funds = (await request(app).get('/finance/funds').set(auth)).body;
    expect(funds.find((f: any) => f.code === 'BLD').position).toBe('1000.00');
    expect(funds.find((f: any) => f.code === 'GEN').position).toBe('0.00');
    expect(await balanceOf(app, auth, '1110')).toEqual({ debit: '1000.00', credit: '0.00' });
    expect((await request(app).get('/finance/integrity').set(auth)).body.ok).toBe(true);
  });

  it('never loses a receipt it cannot post: keeps it as ERROR, and retry books it', async () => {
    await member(app, auth, 'Dan', 'Kamau', '0722000111');
    const types = (await request(app).get('/giving/types').set(auth)).body;
    const offering = types.find((t: any) => t.code === 'OFFERING');
    await request(app).put(`/giving/types/${offering.id}`).set(auth).send({ isActive: false });
    const res = await request(app).post(confirmation()).send(payload({ TransID: 'ERR0000001', MSISDN: '254722000111', BillRefNumber: 'gift', TransAmount: '750' }));
    expect(res.status).toBe(200);
    const failed = (await request(app).get('/mpesa/transactions?status=ERROR').set(auth)).body.data;
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(/inactive/);
    expect((await request(app).get('/giving/contributions').set(auth)).body.data).toHaveLength(0);

    await request(app).put(`/giving/types/${offering.id}`).set(auth).send({ isActive: true });
    const retried = await request(app).post(`/mpesa/transactions/${failed[0].id}/retry`).set(auth);
    expect(retried.status).toBe(200);
    expect(retried.body.status).toBe('MATCHED');
    expect((await request(app).get('/giving/contributions').set(auth)).body.data).toHaveLength(1);
    expect((await request(app).post(`/mpesa/transactions/${failed[0].id}/retry`).set(auth)).status).toBe(409);
  });

  it('answers the validation URL, and rejects a wrong secret or another church\'s secret', async () => {
    const validation = `/mpesa/c2b/validation/${church.slug}/${callbackSecretFor(church.slug)}`;
    expect((await request(app).post(validation).send(payload())).body.ResultCode).toBe(0);
    expect((await request(app).post(validation).send(payload({ TransAmount: 'abc' }))).body.ResultCode).toBe('C2B00012');
    expect((await request(app).post(`/mpesa/c2b/confirmation/${church.slug}/wrong-secret`).send(payload())).status).toBe(403);
    const other = await signUp(app, 'rival');
    expect((await request(app).post(confirmation(church.slug, callbackSecretFor(other.slug))).send(payload())).status).toBe(403);
    expect((await request(app).post(confirmation('nobody', callbackSecretFor('nobody'))).send(payload())).status).toBe(403);
    expect((await request(app).get('/mpesa/transactions').set(auth)).body.data).toHaveLength(0);
  });

  it('keeps churches apart: a payment for one never reaches another inbox', async () => {
    const other = await signUp(app, 'rival');
    await request(app).post(confirmation()).send(payload({ TransID: 'ISO0000001' }));
    expect((await request(app).get('/mpesa/transactions').set(other.admin)).body.data).toHaveLength(0);
    expect((await request(app).get('/mpesa/transactions').set(auth)).body.data).toHaveLength(1);
    // the same M-Pesa id may legitimately appear in two churches' own records
    await request(app).post(confirmation(other.slug, callbackSecretFor(other.slug))).send(payload({ TransID: 'ISO0000001' }));
    expect((await request(app).get('/mpesa/transactions').set(other.admin)).body.data).toHaveLength(1);
  });

  it('protects the console endpoints by role', async () => {
    const auditor = await userWithRole(app, auth, 'audrey', 'AUDITOR');
    const plain = await userWithRole(app, auth, 'mike', 'MEMBER');
    expect((await request(app).get('/mpesa/transactions').set(auditor)).status).toBe(200);
    expect((await request(app).get('/mpesa/transactions').set(plain)).status).toBe(403);
    expect((await request(app).get('/mpesa/config').set(auditor)).status).toBe(403);
    expect((await request(app).post('/mpesa/simulate/c2b').set(auditor).send({ amount: 5 })).status).toBe(403);
    expect((await request(app).get('/mpesa/transactions')).status).toBe(401);
    const config = (await request(app).get('/mpesa/config').set(auth)).body;
    expect(config).toMatchObject({ mode: 'mock', configured: true });
  });

  it.runIf(onPostgres)('applies a receipt once even when the same callback arrives many times at once', async () => {
    await member(app, auth, 'Amina', 'Wanjiru', '0712345678');
    const body = payload({ TransID: 'RACE000001' });
    const results = await Promise.all(Array.from({ length: 8 }, () => request(app).post(confirmation()).send(body)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await request(app).get('/giving/contributions').set(auth)).body.data).toHaveLength(1);
    expect((await request(app).get('/mpesa/transactions').set(auth)).body.data).toHaveLength(1);
  });
});

describe('STK push (mock provider)', () => {
  it('creates a pending request, and a successful result books the gift exactly once', async () => {
    const who = await member(app, auth, 'Eve', 'Njoroge', '0733111222');
    const started = await request(app).post('/mpesa/stk-push').set(auth).send({ memberId: who, amount: 500 });
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ status: 'PENDING', provider: 'mock' });
    expect(started.body.checkoutRequestId).toMatch(/^ws_CO_MOCK_/);
    expect((await request(app).get('/giving/contributions').set(auth)).body.data).toHaveLength(0);

    const done = await request(app).post('/mpesa/simulate/stk-result').set(auth).send({ checkoutRequestId: started.body.checkoutRequestId, success: true });
    expect(done.body).toMatchObject({ status: 'SUCCESS', duplicate: false });
    const again = await request(app).post('/mpesa/simulate/stk-result').set(auth).send({ checkoutRequestId: started.body.checkoutRequestId, success: true });
    expect(again.body.duplicate).toBe(true);
    const gifts = (await request(app).get('/giving/contributions').set(auth)).body.data;
    expect(gifts).toHaveLength(1);
    expect(gifts[0]).toMatchObject({ memberId: who, amount: '500.00', source: 'MPESA' });
    expect(await balanceOf(app, auth, '1110')).toEqual({ debit: '500.00', credit: '0.00' });
  });

  it('accepts Safaricom\'s real callback shape on the public URL, idempotently', async () => {
    const who = await member(app, auth, 'Faith', 'Akinyi', '0744555666');
    const started = await request(app).post('/mpesa/stk-push').set(auth).send({ memberId: who, amount: 1200 });
    const callback = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'x',
          CheckoutRequestID: started.body.checkoutRequestId,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: { Item: [{ Name: 'Amount', Value: 1200 }, { Name: 'MpesaReceiptNumber', Value: 'STK9X8Y7Z6' }, { Name: 'PhoneNumber', Value: 254744555666 }] }
        }
      }
    };
    const url = `/mpesa/stk/callback/${church.slug}/${callbackSecretFor(church.slug)}`;
    expect((await request(app).post(url).send(callback)).status).toBe(200);
    expect((await request(app).post(url).send(callback)).status).toBe(200);
    expect((await request(app).post(`/mpesa/stk/callback/${church.slug}/bad`).send(callback)).status).toBe(403);
    const gifts = (await request(app).get('/giving/contributions').set(auth)).body.data;
    expect(gifts).toHaveLength(1);
    expect(gifts[0].transactionId).toBe('STK9X8Y7Z6');
    // the C2B twin of the same payment must not double-book it
    await request(app).post(confirmation()).send(payload({ TransID: 'STK9X8Y7Z6', TransAmount: '1200', MSISDN: '254744555666' }));
    expect((await request(app).get('/giving/contributions').set(auth)).body.data).toHaveLength(1);
  });

  it('records a cancelled prompt without touching the books, and refuses a bad phone number', async () => {
    const started = await request(app).post('/mpesa/stk-push').set(auth).send({ phone: '0755000111', amount: 50 });
    await request(app).post('/mpesa/simulate/stk-result').set(auth).send({ checkoutRequestId: started.body.checkoutRequestId, success: false });
    const list = (await request(app).get('/mpesa/stk-requests').set(auth)).body;
    expect(list[0].status).toBe('CANCELLED');
    expect(await balanceOf(app, auth, '1110')).toBeNull();
    expect((await request(app).post('/mpesa/stk-push').set(auth).send({ phone: '12345', amount: 50 })).status).toBe(400);
    expect((await request(app).post('/mpesa/stk-push').set(auth).send({ amount: 50 })).status).toBe(400);
  });
});

describe('the Daraja provider (HTTP stubbed; never reaches the network)', () => {
  const config = { baseUrl: 'https://daraja.test', consumerKey: 'key', consumerSecret: 'secret', shortcode: '174379', passkey: 'passkey', callbackBaseUrl: 'https://api.test' };

  it('fetches a token once, builds the STK request Safaricom expects, and surfaces rejections', async () => {
    const calls: Array<{ method: string; url: string; headers: Record<string, string>; body?: any }> = [];
    const http: HttpClient = async (method, url, headers, body) => {
      calls.push({ method, url, headers, body });
      if (url.includes('/oauth/')) return { status: 200, json: { access_token: 'tok-1', expires_in: '3599' } };
      return { status: 200, json: { ResponseCode: '0', CheckoutRequestID: 'ws_CO_1', MerchantRequestID: 'mr-1', CustomerMessage: 'Success. Request accepted for processing' } };
    };
    const at = Date.UTC(2026, 8, 30, 7, 15, 0);
    const provider = new DarajaStkProvider(http, config, () => at);
    const first = await provider.initiate({ phone: '254712345678', amountMinor: 150050, accountRef: 'M12', description: 'Church giving', callbackUrl: 'https://api.test/cb' });
    await provider.initiate({ phone: '254712345678', amountMinor: 10000, accountRef: 'M12', description: 'Church giving', callbackUrl: 'https://api.test/cb' });

    expect(first).toMatchObject({ checkoutRequestId: 'ws_CO_1', merchantRequestId: 'mr-1' });
    expect(calls.filter((c) => c.url.includes('/oauth/'))).toHaveLength(1); // token cached
    expect(calls[0].headers.Authorization).toBe(`Basic ${Buffer.from('key:secret').toString('base64')}`);
    const push = calls[1];
    expect(push.url).toBe('https://daraja.test/mpesa/stkpush/v1/processrequest');
    expect(push.headers.Authorization).toBe('Bearer tok-1');
    expect(push.body).toMatchObject({ BusinessShortCode: '174379', Timestamp: '20260930101500', Amount: 1501, PartyA: '254712345678', PhoneNumber: '254712345678', CallBackURL: 'https://api.test/cb', TransactionType: 'CustomerPayBillOnline' });
    expect(push.body.Password).toBe(Buffer.from('174379passkey20260930101500').toString('base64'));

    const rejecting = new DarajaStkProvider(async (_m, url) => (url.includes('/oauth/') ? { status: 200, json: { access_token: 't' } } : { status: 400, json: { errorMessage: 'Bad Request - Invalid PhoneNumber' } }), config);
    await expect(rejecting.initiate({ phone: '1', amountMinor: 100, accountRef: 'a', description: 'd', callbackUrl: 'u' })).rejects.toThrow(/Invalid PhoneNumber/);
    const noToken = new DarajaStkProvider(async () => ({ status: 401, json: {} }), config);
    await expect(noToken.initiate({ phone: '1', amountMinor: 100, accountRef: 'a', description: 'd', callbackUrl: 'u' })).rejects.toThrow(/token request failed/);
  });
});
