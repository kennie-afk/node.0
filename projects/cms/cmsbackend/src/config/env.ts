import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters so it cannot be brute forced'),
  JWT_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  REDIS_URL: z.string().url().optional(),
  DATABASE_REPLICA_URLS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean)
    ),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(15000),
  METRICS_PORT: z.coerce.number().int().nonnegative().default(0),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(30),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  MPESA_MODE: z.enum(['mock', 'daraja']).default('mock'),
  MPESA_CALLBACK_SECRET: z.string().min(16).optional(),
  SMS_MODE: z.enum(['mock', 'africastalking']).default('mock'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().nonnegative().default(10000)
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration is not usable, refusing to start:\n${problems}`);
  }

  return parsed.data;
}

export const env = load();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
