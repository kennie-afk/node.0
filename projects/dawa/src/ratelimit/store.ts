/**
 * Where rate-limit counters live. By default express-rate-limit keeps them in the process, so with N API replicas every
 * limit is N times looser. With REDIS_URL set, all replicas count in the one Redis. If Redis is unreachable a request is
 * counted in-process instead (never refused because of our own infrastructure), and that is logged.
 */
import { ClientRateLimitInfo, MemoryStore, Options, Store } from 'express-rate-limit';
import { env, isProduction } from '../config/env';
import { logger } from '../common/logger';
import { RedisClient } from './redis';

// one script, one round trip: count, set the window on the first hit, report the time left
const INCREMENT = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local t = redis.call('PTTL', KEYS[1])
if t < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) t = tonumber(ARGV[1]) end
return {c, t}`;

let shared: RedisClient | null = null;
export function redis(): RedisClient | null {
  if (!env.REDIS_URL) return null;
  shared ??= new RedisClient(env.REDIS_URL);
  return shared;
}

export function closeRedis(): void {
  shared?.close();
  shared = null;
}

let warnedDown = 0;
// after a failure Redis is skipped for a few seconds, so a dead Redis does not add its connect timeout to every request
let downUntil = 0;

export class RedisRateLimitStore implements Store {
  readonly localKeys = false;
  prefix: string;
  private windowMs = 60_000;
  private readonly fallback = new MemoryStore();

  constructor(prefix: string, private readonly client: RedisClient) {
    this.prefix = `dawa:rl:${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  private noteDown(error: unknown): void {
    downUntil = Date.now() + 5_000;
    if (Date.now() - warnedDown > 30_000) {
      warnedDown = Date.now();
      logger.error('rate limit store (redis) unavailable, counting in this process only', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    if (Date.now() < downUntil) return this.fallback.increment(key);
    try {
      const reply = (await this.client.command(['EVAL', INCREMENT, '1', this.key(key), String(this.windowMs)])) as [number, number];
      return { totalHits: Number(reply[0]), resetTime: new Date(Date.now() + Number(reply[1])) };
    } catch (error) {
      this.noteDown(error);
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await this.client.command(['DECR', this.key(key)]);
    } catch (error) {
      this.noteDown(error);
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await this.client.command(['DEL', this.key(key)]);
    } catch (error) {
      this.noteDown(error);
      await this.fallback.resetKey(key);
    }
  }
}

/** A store for one limiter: Redis-backed when REDIS_URL is set, otherwise undefined (express-rate-limit's own in-process store). */
export function limiterStore(prefix: string): Store | undefined {
  const client = redis();
  return client ? new RedisRateLimitStore(prefix, client) : undefined;
}

/** Called once at startup: a production deployment without a shared store has per-replica limits, which the operator should know. */
export function warnIfRateLimitsAreLocal(): void {
  if (!env.REDIS_URL && isProduction) {
    logger.warn('REDIS_URL is not set: rate limits are counted per API process, so with several replicas each limit is that many times looser. Sign-in lockout is unaffected (it is kept in Postgres).');
  }
}
