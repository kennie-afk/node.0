import { describe, expect, it, vi } from 'vitest';

// The provider is exercised without a database: only its contract is under test here.
vi.mock('../src/persistence/pool', () => ({ withoutTenant: vi.fn() }));
vi.mock('../src/common/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

describe('the message provider', () => {
  it('the default provider does not send anything and says so', async () => {
    const { MockProvider } = await import('../src/notify/provider');
    const outcome = await new MockProvider().send({ to: '254700000001', purpose: 'signup-code', body: 'code 123456' });
    expect(outcome).toEqual({ status: 'logged' });
  });
});
