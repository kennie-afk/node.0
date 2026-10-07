import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { boot, get, newTenant, on, shutdown } from './helpers';
import { failsBillingCheckDigit, luhnCheckDigit, makeBillingRef } from '../src/billing/ref';

const SECRET = process.env.MPESA_CALLBACK_SECRET ?? 'mpesa-secret-1234567';
const darajaTime = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

describe('billing account number check digit (pure)', () => {
  it('detects every single-digit error and an adjacent swap', () => {
    const ref = makeBillingRef('48213907');
    expect(ref).toMatch(/^AS\d{9}$/);
    expect(failsBillingCheckDigit(ref)).toBe(false);
    for (let pos = 2; pos < 11; pos += 1) {
      for (let d = 0; d < 10; d += 1) {
        if (String(d) === ref[pos]) continue;
        expect(failsBillingCheckDigit(ref.slice(0, pos) + d + ref.slice(pos + 1))).toBe(true);
      }
    }
    expect(failsBillingCheckDigit(ref.slice(0, 4) + ref[5] + ref[4] + ref.slice(6))).toBe(true);
    // legacy numbers have no check digit and are never rejected by it
    expect(failsBillingCheckDigit('AS123456')).toBe(false);
    expect(luhnCheckDigit('7992739871')).toBe('3'); // the standard Luhn worked example
  });
});

describe.runIf(on)('billing payments by account number (real Postgres, RLS on)', () => {
  afterAll(shutdown);

  const pay = async (ref: string, transId: string, amount = 3000) => {
    const { app } = await boot();
    return request(app).post(`/v1/mpesa/c2b/${SECRET}/confirmation`).send({
      TransID: transId, TransTime: darajaTime(), TransAmount: amount, BusinessShortCode: 'MOCKPAYBILL', BillRefNumber: ref, MSISDN: '254711000222'
    });
  };

  it('a duplicate callback is applied once', async () => {
    const t = await newTenant('Dup Callback Ltd');
    const view = (await get(t.owner.auth, '/v1/billing')).body;
    const trans = `DUP${Date.now()}`;
    expect((await pay(view.billingRef, trans, 1000)).status).toBe(200);
    expect((await pay(view.billingRef, trans, 1000)).status).toBe(200);
    const { pool } = await boot();
    const n = await pool.withMigrator(async (c) => (await c.query('SELECT count(*)::int AS n, sum(amount_cents)::bigint AS s FROM billing_payments WHERE external_ref = $1', [trans])).rows[0]);
    expect(n.n).toBe(1);
    expect(Number(n.s)).toBe(100_000);
  });

  it('new accounts get a check-digit number; a mistyped one is held, not credited to another firm', async () => {
    const a = await newTenant('Check Digit A');
    const ref = (await get(a.owner.auth, '/v1/billing')).body.billingRef as string;
    expect(ref).toMatch(/^AS\d{9}$/);
    expect(failsBillingCheckDigit(ref)).toBe(false);
    // one digit off: would have matched some other firm's six-digit number before; now it is held
    const last = Number(ref[10]);
    const typo = ref.slice(0, 10) + String((last + 1) % 10);
    const trans = `TYPO${Date.now()}`;
    expect((await pay(typo, trans)).status).toBe(200);
    const { pool } = await boot();
    const held = await pool.withMigrator(async (c) => (await c.query('SELECT reference FROM unmatched_billing_payments WHERE external_ref = $1', [trans])).rows);
    expect(held).toHaveLength(1);
    const paid = await pool.withMigrator(async (c) => (await c.query('SELECT count(*)::int AS n FROM billing_payments WHERE external_ref = $1', [trans])).rows[0].n);
    expect(paid).toBe(0);
    // the correct number, typed with spaces and lower case, still lands
    expect((await pay(ref.toLowerCase().replace(/^as/, 'as '), `OK${Date.now()}`)).status).toBe(200);
    const okPaid = await pool.withMigrator(async (c) => (await c.query(`SELECT count(*)::int AS n FROM billing_payments WHERE external_ref LIKE 'OK%' AND org_id = $1`, [a.orgId])).rows[0].n);
    expect(okPaid).toBe(1);
  });

  it('an existing six-digit account number is still accepted', async () => {
    const t = await newTenant('Legacy Ref Ltd');
    const { pool } = await boot();
    await pool.withMigrator((c) => c.query(`UPDATE subscriptions SET billing_ref = $2 WHERE org_id = $1`, [t.orgId, `AS${String(900000 + Math.floor(Math.random() * 99999))}`]));
    const ref = (await get(t.owner.auth, '/v1/billing')).body.billingRef as string;
    expect(ref).toMatch(/^AS\d{6}$/);
    const trans = `LEG${Date.now()}`;
    expect((await pay(ref, trans)).status).toBe(200);
    expect((await pool.withMigrator(async (c) => (await c.query('SELECT count(*)::int AS n FROM billing_payments WHERE external_ref = $1', [trans])).rows[0].n))).toBe(1);
  });
});
