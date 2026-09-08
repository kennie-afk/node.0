import rateLimit, { ipKeyGenerator, Options, Store } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient, RedisClientType } from 'redis';
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

export const generalLimiter = limiter('rl:general:', {
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
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

export async function closeRateLimitStore(): Promise<void> {
  if (client?.isOpen) {
    await client.quit().catch(() => undefined);
  }
  client = null;
}
