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
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  LOGIN_RATE_LIMIT_PER_WINDOW: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  TELEMETRY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  // ---- Forecourt's own subscription billing (every price and period here is PROVISIONAL) ----
  // 'mock' lets an owner simulate paying from the console and needs no shortcode; 'live' takes real
  // M-Pesa confirmations on BILLING_SHORTCODE through the same Daraja callback the tills use.
  BILLING_MODE: z.enum(['mock', 'live']).default('mock'),
  // an empty value (compose and .env.example pass one) means "not set"
  // production refuses mock billing unless this is set on purpose (see superRefine below)
  BILLING_ALLOW_MOCK_IN_PRODUCTION: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  BILLING_SHORTCODE: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().min(3).max(20).optional()),
  BILLING_PRICE_STARTER_KES: z.coerce.number().int().positive().default(3500),
  BILLING_PRICE_GROWTH_KES: z.coerce.number().int().positive().default(3000),
  BILLING_GROWTH_MAX_SITES: z.coerce.number().int().positive().default(5),
  BILLING_TRIAL_DAYS: z.coerce.number().int().nonnegative().default(14),
  BILLING_ISSUE_LEAD_DAYS: z.coerce.number().int().nonnegative().default(3),
  BILLING_SUSPEND_AFTER_DAYS: z.coerce.number().int().nonnegative().default(14),
  BILLING_RUN_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  // ---- signup verification ----
  SIGNUP_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  SIGNUP_CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  SIGNUP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),
  // 'mock' only logs and records the message; there is deliberately no real SMS provider wired in
  NOTIFY_PROVIDER: z.enum(['mock']).default('mock'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().nonnegative().default(10000)
});

export type Env = z.infer<typeof schema>;

const schemaChecked = schema.superRefine((value, context) => {
  if (value.BILLING_MODE === 'live' && !value.BILLING_SHORTCODE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['BILLING_SHORTCODE'],
      message: 'BILLING_SHORTCODE is required when BILLING_MODE=live'
    });
  }
});

function load(): Env {
  const parsed = schemaChecked.safeParse(process.env);
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

/**
 * Mock billing lets an owner "pay" without paying. Left on by mistake in a real deployment it would
 * hand out free months, so the API (the only process that serves that route) refuses to start with it
 * in production unless someone says, in writing, that they mean it. Migrations and the telemetry
 * service do not serve it and are not held to this.
 */
export function assertBillingSafeForProduction(): void {
  if (isProduction && env.BILLING_MODE === 'mock' && !env.BILLING_ALLOW_MOCK_IN_PRODUCTION) {
    throw new Error(
      'BILLING_MODE=mock lets owners simulate paying; set BILLING_MODE=live with a BILLING_SHORTCODE, or BILLING_ALLOW_MOCK_IN_PRODUCTION=true for a demo'
    );
  }
}
