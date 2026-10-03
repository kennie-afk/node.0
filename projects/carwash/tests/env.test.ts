import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  DATABASE_MIGRATION_URL: 'postgres://u:p@localhost:5432/db',
  FORECOURT_APP_PASSWORD: 'a-password-12345',
  JWT_SECRET: 'x'.repeat(40),
  MPESA_CALLBACK_SECRET: 'y'.repeat(20)
};

async function loadWith(extra: Record<string, string>) {
  vi.resetModules();
  const saved = { ...process.env };
  Object.assign(process.env, BASE, extra);
  try {
    return (await import('../src/config/env')).env;
  } finally {
    process.env = saved;
  }
}

afterEach(() => vi.resetModules());

describe('billing configuration', () => {
  it('treats an empty BILLING_SHORTCODE as not set, as docker compose and .env.example pass it', async () => {
    const env = await loadWith({ BILLING_SHORTCODE: '', BILLING_MODE: 'mock' });
    expect(env.BILLING_SHORTCODE).toBeUndefined();
    expect(env.BILLING_MODE).toBe('mock');
  });

  it('defaults to the published provisional prices and a 14-day trial', async () => {
    const env = await loadWith({});
    expect([env.BILLING_PRICE_STARTER_KES, env.BILLING_PRICE_GROWTH_KES, env.BILLING_TRIAL_DAYS]).toEqual([3500, 3000, 14]);
  });

  it('refuses mock billing in production unless it is allowed on purpose', async () => {
    await expect(loadWith({ NODE_ENV: 'production', BILLING_MODE: 'mock' })).rejects.toThrow(/BILLING_ALLOW_MOCK_IN_PRODUCTION/);
    expect((await loadWith({ NODE_ENV: 'production', BILLING_MODE: 'mock', BILLING_ALLOW_MOCK_IN_PRODUCTION: 'true' })).BILLING_MODE).toBe('mock');
    expect((await loadWith({ NODE_ENV: 'production', BILLING_MODE: 'live', BILLING_SHORTCODE: '600123' })).BILLING_MODE).toBe('live');
    expect((await loadWith({ NODE_ENV: 'development', BILLING_MODE: 'mock' })).BILLING_MODE).toBe('mock');
  });

  it('refuses to start in live mode without a shortcode, so real money can never arrive on nothing', async () => {
    await expect(loadWith({ BILLING_MODE: 'live', BILLING_SHORTCODE: '' })).rejects.toThrow(/BILLING_SHORTCODE is required/);
    const env = await loadWith({ BILLING_MODE: 'live', BILLING_SHORTCODE: '600123' });
    expect(env.BILLING_SHORTCODE).toBe('600123');
  });
});
