import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { boot, makeGuard, makePlace, liveShift, newTenant, nextPhone, on, post, shutdown } from './helpers';

describe.runIf(on)('sign-in and guard-PIN throttling lives in Postgres (two replicas, one database)', () => {
  afterAll(shutdown);

  it('locks the guesser across replicas and restarts without locking the guard out; the lock doubles when it is tripped again', async () => {
    const { pool } = await boot();
    const { createApiApp } = await import('../src/api/app');
    const replicaA = createApiApp();
    const replicaB = createApiApp(); // a second process, or the first one after a restart: no shared memory with A
    const t = await newTenant('Throttle PG Ltd');
    const place = await makePlace(t.owner.auth);
    const g = await makeGuard(t.owner.auth);
    await liveShift(t.owner.auth, place, g.id);
    const pin = (await post(t.owner.auth, `/v1/guards/${g.id}/pin`)).body.pin as string;
    const attacker = '203.0.113.7';
    const guess = (app: typeof replicaA, ip: string, p: string) => request(app).post('/v1/guard/check').set('X-Forwarded-For', ip).send({ phone: g.phone, pin: p, kind: 'in' });

    // the first 10 wrong tries are split over the two replicas: still counted together
    for (let i = 0; i < 10; i += 1) expect((await guess(i % 2 ? replicaA : replicaB, attacker, `11111${i}`)).status).toBe(401);
    const blockedA = await guess(replicaA, attacker, '222222');
    const blockedB = await guess(replicaB, attacker, '333333');
    expect([blockedA.status, blockedB.status]).toEqual([429, 429]);
    expect(Number(blockedA.headers['retry-after'])).toBeGreaterThan(0);

    // even the right PIN from the attacker's own address is refused while locked (a guess must not be confirmable)
    expect((await guess(replicaB, attacker, pin)).status).toBe(429);

    // the guard, from their own address, signs in with the right PIN: not locked out
    expect((await guess(replicaA, '198.51.100.20', pin)).status).toBe(201);

    // lock expires, the attacker trips it again, and the second lock is longer
    const key = `guard:att:${attacker}|${g.phone}`;
    const first = await pool.withMigrator(async (c) => (await c.query('SELECT level, locked_until FROM auth_throttle WHERE key = $1', [key])).rows[0]);
    expect(first.level).toBe(1);
    await pool.withMigrator((c) => c.query(`UPDATE auth_throttle SET locked_until = now() - interval '1 second' WHERE key = $1`, [key]));
    for (let i = 0; i < 10; i += 1) await guess(replicaA, attacker, `44444${i}`);
    const again = await guess(replicaB, attacker, '555555');
    expect(again.status).toBe(429);
    expect(Number(again.headers['retry-after'])).toBeGreaterThan(60); // doubled from 60s
  }, 60_000);

  it('account-level ceiling is short, never escalates, and is not extended by attempts made while locked', async () => {
    const { pool } = await boot();
    const key = `acct-test:${nextPhone()}`;
    const hit = (limit: number) => pool.withoutTenant(async (c) => (await c.query('SELECT auth_throttle_hit($1, $2, 900, 300, 300) AS w', [key, limit])).rows[0].w as number);
    expect(await hit(2)).toBe(0);
    expect(await hit(2)).toBe(0);
    const lock = await hit(2);
    expect(lock).toBe(300);
    const row1 = await pool.withMigrator(async (c) => (await c.query('SELECT locked_until FROM auth_throttle WHERE key = $1', [key])).rows[0].locked_until as Date);
    for (let i = 0; i < 20; i += 1) expect(await hit(2)).toBeGreaterThan(0);
    const row2 = await pool.withMigrator(async (c) => (await c.query('SELECT locked_until FROM auth_throttle WHERE key = $1', [key])).rows[0].locked_until as Date);
    expect(row2.getTime()).toBe(row1.getTime());
    await pool.withMigrator((c) => c.query(`UPDATE auth_throttle SET locked_until = now() - interval '1 second' WHERE key = $1`, [key]));
    expect(await hit(2)).toBe(0); // free again
  });

  it('sign-in is throttled the same way, and a successful sign-in is not counted against the person', async () => {
    const { app } = await boot();
    const t = await newTenant('Login Throttle Ltd');
    const ip = '203.0.113.99';
    const login = (pin: string, from = ip) => request(app).post('/v1/auth/login').set('X-Forwarded-For', from).send({ phone: t.owner.phone, pin });
    const { env } = await import('../src/config/env');
    for (let i = 0; i < env.LOGIN_RATE_LIMIT_PER_WINDOW; i += 1) expect((await login(`00000${i}`)).status).toBe(401);
    expect((await login('999999')).status).toBe(429);
    expect((await login(t.owner.pin, '198.51.100.50')).status).toBe(200);
    for (let i = 0; i < env.LOGIN_RATE_LIMIT_PER_WINDOW + 5; i += 1) expect((await login(t.owner.pin, '198.51.100.51')).status).toBe(200);
  }, 120_000);
});
