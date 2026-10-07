import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { boot, on, shutdown } from './helpers';

const SECRET = process.env.MPESA_CALLBACK_SECRET ?? 'x';
const darajaTime = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

describe.runIf(on)('money paid to a till nobody has registered', () => {
  afterAll(shutdown);

  it('is kept for an operator exactly once, even when Daraja retries, and the app role cannot read or alter it', async () => {
    const { app, pool } = await boot();
    const transId = `UNC${Date.now()}`;
    const payload = { TransID: transId, TransTime: darajaTime(), TransAmount: 1250, BusinessShortCode: '7654321', BillRefNumber: 'ROOM 4', MSISDN: '254711000111' };

    expect((await request(app).post(`/v1/mpesa/${SECRET}/confirmation`).send(payload)).status).toBe(200);
    expect((await request(app).post(`/v1/mpesa/${SECRET}/confirmation`).send(payload)).status).toBe(200);

    const kept = await pool.withMigrator(async (client) =>
      (await client.query('SELECT short_code, amount_cents, bill_ref, claimed_at FROM mpesa_unclaimed WHERE external_ref = $1', [transId])).rows
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ short_code: '7654321', amount_cents: '125000', bill_ref: 'ROOM 4', claimed_at: null });

    await expect(pool.withoutTenant((client) => client.query('SELECT amount_cents, raw FROM mpesa_unclaimed LIMIT 1'))).rejects.toThrow(/permission denied/);
    await expect(pool.withoutTenant((client) => client.query('DELETE FROM mpesa_unclaimed'))).rejects.toThrow(/permission denied/);
  });
});
