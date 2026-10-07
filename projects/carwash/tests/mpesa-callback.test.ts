import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const on = process.env.FORECOURT_INTEGRATION === '1';
const darajaTime = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

describe.runIf(on)('M-Pesa confirmations: what Daraja is told, and money for an unregistered till (real Postgres, RLS on)', () => {
  let app: import('express').Express;
  let pool: typeof import('../src/persistence/pool');

  async function load() {
    if (app) return;
    pool = await import('../src/persistence/pool');
    app = (await import('../src/api/app')).createApiApp();
  }
  afterAll(async () => {
    if (pool) {
      await pool.closePool();
      await pool.closeMigrationPool();
    }
  });

  const post = (body: unknown) =>
    request(app).post('/v1/webhooks/mpesa/confirmation').set('x-callback-secret', process.env.MPESA_CALLBACK_SECRET!).send(body as object);

  it('keeps money paid to an unregistered till exactly once, even when Daraja retries, and the app role cannot read it', async () => {
    await load();
    const transId = `UNC${Date.now()}`;
    const body = { TransID: transId, TransTime: darajaTime(), TransAmount: 800, BusinessShortCode: '7654321', BillRefNumber: 'KCE 901Z', MSISDN: '254711000111' };

    expect((await post(body)).body.ResultCode).toBe(0);
    expect((await post(body)).body.ResultCode).toBe(0);

    const kept = await pool.withMigrator(async (c) =>
      (await c.query('SELECT short_code, amount_cents, bill_ref FROM mpesa_unclaimed WHERE external_ref = $1', [transId])).rows
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ short_code: '7654321', amount_cents: '80000', bill_ref: 'KCE 901Z' });
    await expect(pool.withoutTenant((c) => c.query('SELECT amount_cents, raw FROM mpesa_unclaimed LIMIT 1'))).rejects.toThrow(/permission denied/);
  });

  it('acknowledges a malformed confirmation, which can never become valid', async () => {
    await load();
    const res = await post({ nonsense: true });
    expect(res.status).toBe(200);
    expect(res.body.ResultCode).toBe(0);
  });

  it('refuses the same number in a second organisation and frees it when the account is disabled', async () => {
    await load();
    const provisioning = await import('../src/admin/provisioning');
    const phone = `2547${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
    const a = await provisioning.provisionOrganisation({ businessName: 'Phone A', ownerName: 'A Owner', ownerPhone: phone });
    const other = await provisioning.provisionOrganisation({
      businessName: 'Phone B',
      ownerName: 'B Owner',
      ownerPhone: `2547${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`
    });
    const insert = () =>
      pool.withMigrator((c) =>
        c.query(`INSERT INTO users (org_id, display_name, role, phone, pin_hash) VALUES ($1, 'Twin', 'manager', $2, 'x')`, [other.orgId, a.phone])
      );

    await expect(insert()).rejects.toMatchObject({ code: '23505' });
    await pool.withMigrator((c) => c.query(`UPDATE users SET status = 'disabled' WHERE phone = $1`, [a.phone]));
    await expect(insert()).resolves.toBeDefined();
  });
});

describe.runIf(on)('a transient failure is never acknowledged (real Postgres)', () => {
  it('answers 5xx so Daraja retries, instead of telling it money was recorded when it was not', async () => {
    vi.resetModules();
    vi.doMock('../src/mpesa/service', () => ({ ingestConfirmation: vi.fn().mockRejectedValue(new Error('connection terminated unexpectedly')) }));
    const app = (await import('../src/api/app')).createApiApp();

    const res = await request(app)
      .post('/v1/webhooks/mpesa/confirmation')
      .set('x-callback-secret', process.env.MPESA_CALLBACK_SECRET!)
      .send({ TransID: 'X1', TransTime: darajaTime(), TransAmount: 5, BusinessShortCode: '1', BillRefNumber: '', MSISDN: '254700000000' });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.ResultCode).toBe(1);
    const pool = await import('../src/persistence/pool');
    await pool.closePool();
    await pool.closeMigrationPool();
    vi.doUnmock('../src/mpesa/service');
  });
});
