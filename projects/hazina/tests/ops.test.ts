import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { boot, on, shutdown } from './helpers';
import { csvMoney, moneyText } from '../src/domain/money';

afterAll(shutdown);

describe('money display helpers (pure, integer cents)', () => {
  it('formats without float division', () => {
    expect(csvMoney(0)).toBe('0.00');
    expect(csvMoney(5)).toBe('0.05');
    expect(csvMoney(123_456)).toBe('1234.56');
    expect(csvMoney(-250)).toBe('-2.50');
    expect(csvMoney(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
    expect(moneyText(100_000)).toBe('1,000');
    expect(moneyText(123_456_789)).toBe('1,234,567.89');
    expect(moneyText(7)).toBe('0.07');
    expect(() => csvMoney(1.5)).toThrow();
  });
});

describe.runIf(on)('readiness (real Postgres)', () => {
  it('is ready only when every shipped migration is applied, and says which is missing', async () => {
    const { app, pool } = await boot();
    const ok = await request(app).get('/readyz');
    expect(ok.status).toBe(200);
    expect(ok.body.schemaVersion).toMatch(/^\d{4}_/);

    const latest = ok.body.schemaVersion as string;
    // pretend the newest migration has not run; put it back whatever happens
    await pool.withMigrator((c) => c.query('DELETE FROM schema_migrations WHERE name = $1', [latest]));
    try {
      const pending = await request(app).get('/readyz');
      expect(pending.status).toBe(503);
      expect(pending.body).toMatchObject({ reason: 'migrations pending', pending: [latest] });
    } finally {
      await pool.withMigrator((c) => c.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [latest]));
    }
    expect((await request(app).get('/readyz')).status).toBe(200);
  });
});
