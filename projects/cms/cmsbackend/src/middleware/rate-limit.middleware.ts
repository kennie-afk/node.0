import rateLimit, { ipKeyGenerator, Options, Store } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient, RedisClientType } from 'redis';
import jwt from 'jsonwebtoken';
import { env, isTest } from '../config/env';
import { logger } from '../common/logger';

let client: RedisClientType | null = null;

function sharedStore(prefix: string): Store | undefined {
  if (!env.REDIS_URL) {
    return undefined;
  }

  if (!client) {
    client = createClient({ url: env.REDIS_URL });
    client.on('error', (error: Error) => {
      logger.error('rate limit store unavailable', { error: error.message });
    });
    void client.connect();
  }

  const connected = client;
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => connected.sendCommand(args)
  }) as unknown as Store;
}

function limiter(prefix: string, options: Partial<Options>) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    store: sharedStore(prefix),
    ...options
  });
}

/**
 * A whole congregation shares one wifi address, so keying on IP alone would throttle every
 * tablet and phone in the building together. A request with a valid token is counted against
 * that user; only the signature-checked identity is trusted, anything else falls back to IP.
 */
function generalKey(req: { headers: { authorization?: string }; ip?: string }): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const claims = jwt.verify(header.slice(7).trim(), env.JWT_SECRET) as { id?: number; churchId?: number };
      if (typeof claims.id === 'number' && typeof claims.churchId === 'number') {
        return `u:${claims.churchId}:${claims.id}`;
      }
    } catch {
      // an invalid token is treated like no token
    }
  }
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

export const generalLimiter = limiter('rl:general:', {
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  keyGenerator: generalKey,
  limit: env.RATE_LIMIT_MAX
});

export const loginLimiter = limiter('rl:login:', {
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${ipKeyGenerator(req.ip ?? 'unknown')}|${email}`;
  },
  message: {
    message: 'Too many sign in attempts. Wait a few minutes and try again.'
  }
});

/** The public giving page has no login to count against, so it is counted per address, and tightly. */
export const publicGivingLimiter = limiter('rl:public-give:', {
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  message: { message: 'Too many requests. Wait a few minutes and try again.' }
});

export async function closeRateLimitStore(): Promise<void> {
  if (client?.isOpen) {
    await client.quit().catch(() => undefined);
  }
  client = null;
}
