import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  INGESTION_PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_MIGRATION_URL: z
    .string()
    .min(1, 'DATABASE_MIGRATION_URL is required (migrations create/grant the app role, which DATABASE_URL cannot do)'),
  FORECOURT_APP_PASSWORD: z
    .string()
    .min(12, 'FORECOURT_APP_PASSWORD must be at least 12 characters'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
  DATABASE_CA_CERT: z.string().optional(),
  // Explicit, not inferred from NODE_ENV: the Docker image bakes NODE_ENV=production
  // regardless of environment, so tying TLS to isProduction meant the bundled
  // docker-compose Postgres (which has no SSL configured) could never be reached -
  // "the server does not support SSL connections" on every fresh `docker compose up`.
  // A real deployment with a TLS-terminating database sets this explicitly to true.
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_TTL_MINUTES: z.coerce.number().int().positive().default(720),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean)),
  MPESA_CALLBACK_SECRET: z.string().min(16, 'MPESA_CALLBACK_SECRET must be at least 16 characters'),
  MPESA_ALLOWED_IPS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean)),
  LOGIN_RATE_LIMIT_PER_WINDOW: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  TELEMETRY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().nonnegative().default(10000)
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration is not usable, refusing to start:\n${detail}`);
  }
  return parsed.data;
}

export const env = load();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
