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
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
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
  // Object storage for bill attachments, sermon media and exported audit-chain heads.
  // `local` writes under OBJECT_STORE_DIR (fine for one VM with a persistent disk); `s3` talks to any
  // S3-compatible service (AWS S3, MinIO) with SigV4 and pre-signed download URLs.
  OBJECT_STORE_DRIVER: z.enum(['local', 's3']).default('local'),
  OBJECT_STORE_DIR: z.string().default('./.object-store'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  // Where the nightly audit-chain head is also POSTed (an off-site witness the database owner cannot edit).
  CHAIN_HEAD_WEBHOOK: z.string().url().optional(),
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

/**
 * A production process on mock M-Pesa or mock SMS accepts "payments" that never happened and sends
 * messages to nobody, and a forgotten environment variable is all it takes to end up there. So
 * production refuses to start on a mock provider unless that was asked for in so many words. The mock
 * is still wanted for demos and first-run deployments; it is now a visible decision, not a default.
 */
export function assertProvidersSafeForProduction(
  config: Pick<Env, 'NODE_ENV' | 'MPESA_MODE' | 'SMS_MODE'> = env,
  allowMock: boolean = process.env.ALLOW_MOCK_PROVIDERS_IN_PRODUCTION === 'true'
): string[] {
  if (config.NODE_ENV !== 'production') return [];
  const mocked = [
    config.MPESA_MODE === 'mock' ? 'MPESA_MODE' : null,
    config.SMS_MODE === 'mock' ? 'SMS_MODE' : null
  ].filter((name): name is string => name !== null);
  if (mocked.length === 0) return [];
  if (!allowMock) {
    throw new Error(
      `${mocked.join(' and ')} ${mocked.length > 1 ? 'are' : 'is'} still "mock" in production, so money and messages would be pretended. ` +
        'Configure the real provider, or set ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=true to run a demo knowingly.'
    );
  }
  return [`${mocked.join(' and ')} on mock in production: nothing real is collected or sent`];
}
