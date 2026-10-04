/**
 * A small read-through cache for expensive, read-only results (financial statements, the
 * dashboard). Keys carry a per-church version; any ledger write bumps the version, so every cached
 * statement for that church is orphaned at once without scanning or deleting keys, and orphans age
 * out through their TTL.
 *
 * It is an optimisation only: with no REDIS_URL, or with Redis down, every call computes the
 * result and nothing is ever wrong. Reports are therefore at most `CACHE_TTL_SECONDS` stale, and
 * never stale after a write in this process's own church, because the version moves the moment the
 * writing transaction COMMITS (bumping earlier would let a concurrent reader cache old data under
 * the new version).
 */
import { createHash } from 'node:crypto';
import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env';
import { logger } from './logger';

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  incr(key: string): Promise<number>;
  close?(): Promise<void>;
}

/** Process-local store, for tests and single-node deployments that want caching without Redis. */
export class MemoryCacheStore implements CacheStore {
  private readonly data = new Map<string, { value: string; expires: number }>();
  private readonly counters = new Map<string, number>();
  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string) {
    if (this.counters.has(key)) return String(this.counters.get(key));
    const hit = this.data.get(key);
    if (!hit) return null;
    if (hit.expires <= this.now()) {
      this.data.delete(key);
      return null;
    }
    return hit.value;
  }
  async set(key: string, value: string, ttlSeconds: number) {
    this.data.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
  }
  async incr(key: string) {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
  get size() {
    return this.data.size;
  }
}

class RedisCacheStore implements CacheStore {
  private client: RedisClientType;
  constructor(url: string) {
    this.client = createClient({ url, socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5000) } });
    this.client.on('error', (error: Error) => logger.warn('cache unavailable', { error: error.message }));
    void this.client.connect().catch(() => undefined);
  }
  async get(key: string) {
    return this.client.isReady ? this.client.get(key) : null;
  }
  async set(key: string, value: string, ttlSeconds: number) {
    if (this.client.isReady) await this.client.set(key, value, { EX: ttlSeconds });
  }
  async incr(key: string) {
    return this.client.isReady ? this.client.incr(key) : Date.now();
  }
  async close() {
    if (this.client.isOpen) await this.client.quit().catch(() => undefined);
  }
}

let store: CacheStore | null | undefined;

function activeStore(): CacheStore | null {
  if (store === undefined) {
    store = env.REDIS_URL && env.CACHE_TTL_SECONDS > 0 ? new RedisCacheStore(env.REDIS_URL) : null;
  }
  return store;
}

/** Tests inject a MemoryCacheStore; pass null to switch caching off. */
export function setCacheStore(next: CacheStore | null): void {
  store = next;
}

export async function closeCache(): Promise<void> {
  await store?.close?.();
  store = undefined;
}

const versionKey = (churchId: number) => `cms:cv:${churchId}`;

/** Orphans every cached result for the church. Errors are swallowed: a missed bump is bounded by TTL. */
export async function bumpTenantCache(churchId: number): Promise<void> {
  try {
    await activeStore()?.incr(versionKey(churchId));
  } catch (error) {
    logger.warn('cache version bump failed', { churchId, error: error instanceof Error ? error.message : String(error) });
  }
}

export interface CacheOptions {
  ttlSeconds?: number;
}

/**
 * Concurrent requests for the same missing key share ONE computation instead of each running the
 * (expensive) query: when a popular report's entry expires, the first caller recomputes it and the
 * rest wait for that result. Without this, 30 simultaneous requests are 30 identical multi-second
 * queries and the tail latency is the queue behind them.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function cached<T>(churchId: number, name: string, params: unknown, compute: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
  const backing = activeStore();
  if (!backing) return compute();
  const ttl = options.ttlSeconds ?? (env.CACHE_TTL_SECONDS || 30);
  let key: string;
  try {
    const version = (await backing.get(versionKey(churchId))) ?? '0';
    const digest = createHash('sha1').update(JSON.stringify(params ?? null)).digest('hex').slice(0, 20);
    key = `cms:rep:${churchId}:v${version}:${name}:${digest}`;
    const hit = await backing.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch {
    return compute();
  }
  const pending = inFlight.get(key);
  if (pending) {
    try {
      return (await pending) as T;
    } catch {
      // The request that started this computation failed or was cancelled (its transaction goes with
      // it); that is no reason for us to fail too, so compute our own.
      return compute();
    }
  }
  const work = (async () => {
    const fresh = await compute();
    try {
      await backing.set(key, JSON.stringify(fresh), ttl);
    } catch {
      /* an uncacheable result is still a correct result */
    }
    return fresh;
  })();
  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}
