import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, boot, dayOffset, makeProduct, newTenant, nextPhone, on, post, receive, shutdown, signIn } from './helpers';

vi.setConfig({ testTimeout: 90_000 });
afterAll(shutdown);

async function lockRow(phone: string) {
  const { pool } = await boot();
  return pool.withMigrator(async (c) => (await c.query('SELECT failures, locked_until, locked_until > now() AS locked FROM login_lockouts WHERE phone = $1', [phone])).rows[0]);
}

describe.runIf(on)('sign-in lockout per account, kept in Postgres (real Postgres)', () => {
  it('locks after the threshold, refuses even the right PIN while locked, and says how long to wait', async () => {
    await boot();
    const { env } = await import('../src/config/env');
    const t = await newTenant('Lockout Chemist');
    const phone = t.owner.phone;
    for (let i = 0; i < env.LOGIN_LOCKOUT_THRESHOLD; i += 1) expect((await signIn(phone, '000000')).status).toBe(401);
    expect((await lockRow(phone)).locked).toBe(true);
    const res = await request((await boot()).app).post('/v1/auth/login').send({ phone, pin: t.owner.pin });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('account-locked');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(env.LOGIN_LOCKOUT_BASE_SECONDS);
    // 0712... and 254712... are the same account, so the same lock
    expect((await signIn(`0${phone.slice(3)}`, t.owner.pin)).status).toBe(429);
  });

  it('holds across another API instance (a second replica, or a restart): the count is in the database, not the process', async () => {
    await boot();
    const { env } = await import('../src/config/env');
    const { createApiApp } = await import('../src/api/app');
    const replicaA = (await boot()).app;
    const replicaB = createApiApp(); // a second process would have its own empty memory; the database is shared
    const t = await newTenant('Replica Chemist');
    const phone = t.owner.phone;
    // wrong guesses alternate between the two replicas
    for (let i = 0; i < env.LOGIN_LOCKOUT_THRESHOLD; i += 1) {
      const app = i % 2 === 0 ? replicaA : replicaB;
      expect((await request(app).post('/v1/auth/login').send({ phone, pin: '111111' })).status).toBe(401);
    }
    expect((await request(replicaA).post('/v1/auth/login').send({ phone, pin: t.owner.pin })).status).toBe(429);
    expect((await request(replicaB).post('/v1/auth/login').send({ phone, pin: t.owner.pin })).status).toBe(429);
  });

  it('backs off: each further wrong PIN after the threshold doubles the wait, up to the cap; the wait does not grow while locked', async () => {
    await boot();
    const { env } = await import('../src/config/env');
    const { recordFailure } = await import('../src/ratelimit/lockout');
    const phone = nextPhone();
    const waits: number[] = [];
    for (let i = 0; i < env.LOGIN_LOCKOUT_THRESHOLD + 4; i += 1) {
      await recordFailure(phone);
      const { pool } = await boot();
      const w = await pool.withMigrator(async (c) => (await c.query('SELECT extract(epoch FROM (locked_until - now())) AS s FROM login_lockouts WHERE phone = $1', [phone])).rows[0].s);
      waits.push(w === null ? 0 : Math.round(Number(w)));
    }
    const over = waits.slice(env.LOGIN_LOCKOUT_THRESHOLD - 1);
    expect(waits.slice(0, env.LOGIN_LOCKOUT_THRESHOLD - 1).every((w) => w === 0)).toBe(true);
    for (let i = 1; i < over.length; i += 1) expect(over[i]!).toBeGreaterThan(over[i - 1]! * 1.8);
    expect(Math.max(...waits)).toBeLessThanOrEqual(env.LOGIN_LOCKOUT_MAX_SECONDS);
    // attempts made while locked are refused before the PIN is looked at and do not extend the lock
    const before = (await lockRow(phone)).failures;
    await signIn(phone, '123456');
    expect((await lockRow(phone)).failures).toBe(before);
  });

  it('lets the right person back in when the wait is over, and a good sign-in clears the count', async () => {
    await boot();
    const { env } = await import('../src/config/env');
    const t = await newTenant('Recover Chemist');
    const phone = t.owner.phone;
    for (let i = 0; i < env.LOGIN_LOCKOUT_THRESHOLD; i += 1) await signIn(phone, '000000');
    expect((await signIn(phone, t.owner.pin)).status).toBe(429);
    const { pool } = await boot();
    await pool.withMigrator((c) => c.query(`UPDATE login_lockouts SET locked_until = now() - interval '1 second' WHERE phone = $1`, [phone]));
    expect((await signIn(phone, t.owner.pin)).status).toBe(200);
    expect(await lockRow(phone)).toBeUndefined();
    // a few wrong PINs, then the right one, then a few more: never reaches the threshold in a row
    for (let i = 0; i < env.LOGIN_LOCKOUT_THRESHOLD - 1; i += 1) await signIn(phone, '000000');
    expect((await signIn(phone, t.owner.pin)).status).toBe(200);
    for (let i = 0; i < env.LOGIN_LOCKOUT_THRESHOLD - 1; i += 1) expect((await signIn(phone, '000000')).status).toBe(401);
  });

  it('applies the same lock to a witness PIN, so the controlled-drug witness prompt cannot be used to guess a colleague\'s PIN', async () => {
    await boot();
    const { env } = await import('../src/config/env');
    const t = await newTenant('Witness Lock');
    const ph1 = await addStaff(t, 'pharmacist');
    const ph2 = await addStaff(t, 'pharmacist');
    const cd = await makeProduct(t.owner.auth, { category: 'controlled' });
    const wrong = { phone: ph2.phone, pin: '000000' };
    for (let i = 0; i < env.LOGIN_LOCKOUT_THRESHOLD; i += 1) {
      const r = await receive(ph1.auth, cd, [{ batchNo: `W${i}`, expiryDate: dayOffset(300), qty: 1 }], { witness: wrong });
      expect(r.status).toBe(401);
    }
    // now even the right PIN is refused as a witness, and as a sign-in
    const blocked = await receive(ph1.auth, cd, [{ batchNo: 'WX', expiryDate: dayOffset(300), qty: 1 }], { witness: { phone: ph2.phone, pin: ph2.pin } });
    expect(blocked.status).toBe(429);
    expect((await signIn(ph2.phone, ph2.pin)).status).toBe(429);
  });

  it('keeps one row per number and never reveals whether a number has an account', async () => {
    await boot();
    const { env } = await import('../src/config/env');
    const ghost = nextPhone();
    const codes: number[] = [];
    for (let i = 0; i < env.LOGIN_LOCKOUT_THRESHOLD + 1; i += 1) codes.push((await signIn(ghost, '000000')).status);
    expect(codes).toEqual([...Array(env.LOGIN_LOCKOUT_THRESHOLD).fill(401), 429]);
  });
});

describe.runIf(on)('migration 0009 indexes', () => {
  it('has trigram indexes behind every free-text search', async () => {
    const { pool } = await boot();
    const names = await pool.withMigrator(async (c) => (await c.query(`SELECT indexname FROM pg_indexes WHERE indexdef ILIKE '%gin_trgm_ops%'`)).rows.map((r) => r.indexname));
    for (const n of ['dispensing_patient_trgm', 'products_name_trgm', 'products_generic_trgm', 'customers_name_trgm', 'customers_phone_trgm', 'suppliers_name_trgm']) expect(names).toContain(n);
  });
});
