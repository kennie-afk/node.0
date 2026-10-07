import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const blankIsUnset = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4200),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_MIGRATION_URL: z
    .string()
    .min(1, 'DATABASE_MIGRATION_URL is required (migrations create/grant the app role, which DATABASE_URL cannot do)'),
  DAWA_APP_PASSWORD: z.string().min(12, 'DAWA_APP_PASSWORD must be at least 12 characters'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
  DATABASE_CA_CERT: z.string().optional(),
  // Explicit, not inferred from NODE_ENV: the Docker image bakes NODE_ENV=production, and the bundled
  // compose Postgres has no TLS. A deployment with a TLS-terminating database sets this to true.
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
  // The M-Pesa confirmation URL registered with Safaricom carries this secret as a path segment. It is
  // our own authentication, not something Daraja signs: no Daraja signature scheme is assumed anywhere.
  MPESA_CALLBACK_SECRET: z.string().min(16, 'MPESA_CALLBACK_SECRET must be at least 16 characters'),
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(240),
  LOGIN_RATE_LIMIT_PER_WINDOW: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  // ---- Dawa's own subscription billing (every price and period here is PROVISIONAL) ----
  // 'mock' lets an owner simulate paying from the console and needs no shortcode; 'live' takes real
  // M-Pesa confirmations on BILLING_SHORTCODE through the same confirmation endpoint the branches use.
  BILLING_MODE: z.enum(['mock', 'live']).default('mock'),
  // production refuses mock billing unless this is set on purpose (see assertBillingSafeForProduction)
  BILLING_ALLOW_MOCK_IN_PRODUCTION: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  BILLING_SHORTCODE: z.preprocess(blankIsUnset, z.string().trim().min(3).max(20).optional()),
  // first branch / each additional branch, whole shillings per month
  BILLING_PRICE_FIRST_BRANCH_KES: z.coerce.number().int().positive().default(4500),
  BILLING_PRICE_EXTRA_BRANCH_KES: z.coerce.number().int().positive().default(3500),
  BILLING_TRIAL_DAYS: z.coerce.number().int().nonnegative().default(14),
  BILLING_ISSUE_LEAD_DAYS: z.coerce.number().int().nonnegative().default(3),
  BILLING_SUSPEND_AFTER_DAYS: z.coerce.number().int().nonnegative().default(14),
  BILLING_RUN_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  // ---- signup verification ----
  SIGNUP_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  SIGNUP_CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  SIGNUP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),
  // 'mock' only logs and records the message. 'africastalking' sends through Africa's Talking's SMS API; that
  // integration is written from their public documentation and has NOT been run against the real service.
  NOTIFY_MODE: z.enum(['mock', 'africastalking']).default('mock'),
  AT_USERNAME: z.preprocess(blankIsUnset, z.string().trim().min(1).optional()),
  AT_API_KEY: z.preprocess(blankIsUnset, z.string().trim().min(1).optional()),
  // optional registered sender id; without one Africa's Talking uses its shared sender
  AT_SENDER_ID: z.preprocess(blankIsUnset, z.string().trim().min(1).max(11).optional()),
  // the sandbox host is api.sandbox.africastalking.com; leave unset for production
  AT_BASE_URL: z.preprocess(blankIsUnset, z.string().url().default('https://api.africastalking.com')),
  AT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // ---- rate limits shared between replicas ----
  // Without REDIS_URL each API process counts on its own, so N replicas allow N times the limit.
  REDIS_URL: z.preprocess(blankIsUnset, z.string().url().optional()),
  // ---- sign-in lockout (kept in Postgres, so it holds across restarts and replicas) ----
  // after this many wrong PINs in a row for one phone number, further attempts wait; the wait doubles each time
  LOGIN_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_BASE_SECONDS: z.coerce.number().int().positive().default(30),
  LOGIN_LOCKOUT_MAX_SECONDS: z.coerce.number().int().positive().default(900),
  // ---- stock rules (owner-tunable defaults) ----
  EXPIRY_WARNING_DAYS: z.coerce.number().int().positive().default(90),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().nonnegative().default(10000)
});

export type Env = z.infer<typeof schema>;

const schemaChecked = schema.superRefine((value, context) => {
  if (value.NOTIFY_MODE === 'africastalking' && (!value.AT_USERNAME || !value.AT_API_KEY)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['AT_API_KEY'], message: 'AT_USERNAME and AT_API_KEY are required when NOTIFY_MODE=africastalking' });
  }
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
 * hand out free months, so the API refuses to start with it in production unless someone says, in
 * writing, that they mean it.
 */
export function assertBillingSafeForProduction(): void {
  if (isProduction && env.BILLING_MODE === 'mock' && !env.BILLING_ALLOW_MOCK_IN_PRODUCTION) {
    throw new Error(
      'BILLING_MODE=mock lets owners simulate paying; set BILLING_MODE=live with a BILLING_SHORTCODE, or BILLING_ALLOW_MOCK_IN_PRODUCTION=true for a demo'
    );
  }
}
