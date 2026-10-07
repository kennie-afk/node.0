import { describe, expect, it } from 'vitest';
import { assertProvidersSafeForProduction } from '../src/config/env';

const mock = { MPESA_MODE: 'mock', SMS_MODE: 'mock' } as const;
const real = { MPESA_MODE: 'daraja', SMS_MODE: 'africastalking' } as const;

describe('production refuses to pretend to take money', () => {
  it('stops a production process that is still on mock M-Pesa or mock SMS, naming what is mocked', () => {
    expect(() => assertProvidersSafeForProduction({ NODE_ENV: 'production', ...mock }, false)).toThrow(/MPESA_MODE and SMS_MODE are still "mock"/);
    expect(() => assertProvidersSafeForProduction({ NODE_ENV: 'production', MPESA_MODE: 'daraja', SMS_MODE: 'mock' }, false)).toThrow(/SMS_MODE is still "mock"/);
  });

  it('lets a knowing operator run a demo on mocks, with a warning that says so', () => {
    const warnings = assertProvidersSafeForProduction({ NODE_ENV: 'production', ...mock }, true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/nothing real is collected or sent/);
  });

  it('is silent for real providers, and never gets in the way of development or tests', () => {
    expect(assertProvidersSafeForProduction({ NODE_ENV: 'production', ...real }, false)).toEqual([]);
    expect(assertProvidersSafeForProduction({ NODE_ENV: 'development', ...mock }, false)).toEqual([]);
    expect(assertProvidersSafeForProduction({ NODE_ENV: 'test', ...mock }, false)).toEqual([]);
  });
});
