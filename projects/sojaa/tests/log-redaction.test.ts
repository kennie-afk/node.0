import { describe, expect, it } from 'vitest';
import { redactPath } from '../src/api/middleware';

describe('callback secrets never reach a log line', () => {
  it('hides the shared secret in every callback URL shape and leaves other paths alone', () => {
    const secret = 'S3cr3t-value-123';
    for (const url of [
      `/v1/mpesa/${secret}/confirmation`,
      `/v1/mpesa/c2b/${secret}/validation`,
      `/v1/hooks/pay/${secret}/confirmation?x=1`
    ]) {
      const shown = redactPath(url);
      expect(shown).not.toContain(secret);
      expect(shown).toContain('[redacted]');
    }
    expect(redactPath('/v1/sales?limit=20')).toBe('/v1/sales?limit=20');
  });
});
