import { afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { RedisClient } from '../src/ratelimit/redis';
import { RedisRateLimitStore } from '../src/ratelimit/store';

// Needs a real Redis (docker run -p 56380:6379 redis:7-alpine); skipped, loudly, without one.
const REDIS = process.env.REDIS_TEST_URL;
const closers: Array<() => void> = [];
afterAll(() => closers.forEach((c) => c()));

function appWithLimit(store: RedisRateLimitStore, limit: number) {
  const app = express();
  app.use(rateLimit({ windowMs: 60_000, limit, store, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => String(req.headers['x-who'] ?? 'anon') }));
  app.get('/', (_req, res) => res.json({ ok: true }));
  return app;
}

describe.runIf(Boolean(REDIS))('rate limit counters shared through Redis', () => {
  it('counts across two separate API instances: N replicas no longer mean N times the limit', async () => {
    const prefix = `t${Date.now()}`;
    const a = new RedisClient(REDIS!);
    const b = new RedisClient(REDIS!);
    closers.push(() => a.close(), () => b.close());
    const replicaA = appWithLimit(new RedisRateLimitStore(prefix, a), 5);
    const replicaB = appWithLimit(new RedisRateLimitStore(prefix, b), 5);
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) statuses.push((await request(i % 2 === 0 ? replicaA : replicaB).get('/').set('x-who', 'u1')).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
    // a different caller has their own allowance
    expect((await request(replicaB).get('/').set('x-who', 'u2')).status).toBe(200);
    // in-process stores would have let 5 through on each replica
    const local = (limit: number) => { const app = express(); app.use(rateLimit({ windowMs: 60_000, limit, standardHeaders: true, legacyHeaders: false, keyGenerator: () => 'k' })); app.get('/', (_q, r) => { r.json({}); }); return app; };
    const la = local(5);
    const lb = local(5);
    let passed = 0;
    for (let i = 0; i < 8; i += 1) if ((await request(i % 2 === 0 ? la : lb).get('/')).status === 200) passed += 1;
    expect(passed).toBe(8);
  });

  it('expires the window in Redis and reports the time left', async () => {
    const c = new RedisClient(REDIS!);
    closers.push(() => c.close());
    const store = new RedisRateLimitStore(`ttl${Date.now()}`, c);
    store.init({ windowMs: 1500 } as never);
    const first = await store.increment('k');
    expect(first.totalHits).toBe(1);
    expect(first.resetTime!.getTime() - Date.now()).toBeLessThanOrEqual(1500);
    expect((await store.increment('k')).totalHits).toBe(2);
    await new Promise((r) => setTimeout(r, 1700));
    expect((await store.increment('k')).totalHits).toBe(1);
    await store.decrement('k');
    expect((await store.increment('k')).totalHits).toBe(1);
    await store.resetKey('k');
    expect((await store.increment('k')).totalHits).toBe(1);
  });

  it('speaks to a Redis that wants a password, and refuses a wrong one by falling back, not by failing requests', async () => {
    const c = new RedisClient(REDIS!.replace('redis://', 'redis://:wrong-password@'));
    closers.push(() => c.close());
    const store = new RedisRateLimitStore(`auth${Date.now()}`, c);
    store.init({ windowMs: 60_000 } as never);
    // the server has no password set, so AUTH is an error; the limiter must still count (in this process)
    expect((await store.increment('k')).totalHits).toBe(1);
    expect((await store.increment('k')).totalHits).toBe(2);
  });
});

describe('rate limit counters when Redis is unreachable', () => {
  it('keeps limiting in-process instead of failing the request, and does not wait on the dead server every time', async () => {
    const dead = new RedisClient('redis://127.0.0.1:1', 300); // nothing listens on port 1
    closers.push(() => dead.close());
    const store = new RedisRateLimitStore(`dead${Date.now()}`, dead);
    const app = appWithLimit(store, 3);
    const started = Date.now();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await request(app).get('/').set('x-who', 'z')).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
