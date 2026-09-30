import { describe, expect, it } from 'vitest';
import type { Consent } from '../../../api/dataopsApi';
import { consentKey, latestConsents } from './consent';

const rec = (id: number, granted: boolean, at: string, channel: Consent['channel'] = 'SMS'): Consent => ({ id, memberId: 1, purpose: 'COMMUNICATIONS', channel, granted, source: 'SELF', notes: null, recordedAt: at });

describe('latestConsents', () => {
  it('keeps the newest choice per purpose and channel', () => {
    const map = latestConsents([rec(1, true, '2026-01-01T00:00:00Z'), rec(2, false, '2026-02-01T00:00:00Z'), rec(3, true, '2026-01-15T00:00:00Z', 'EMAIL')]);
    expect(map.get(consentKey('COMMUNICATIONS', 'SMS'))?.granted).toBe(false);
    expect(map.get(consentKey('COMMUNICATIONS', 'EMAIL'))?.granted).toBe(true);
    expect(map.get(consentKey('PHOTOS', 'ANY'))).toBeUndefined();
  });
  it('breaks a timestamp tie by the higher id', () => {
    const map = latestConsents([rec(5, true, '2026-01-01T00:00:00Z'), rec(6, false, '2026-01-01T00:00:00Z')]);
    expect(map.get(consentKey('COMMUNICATIONS', 'SMS'))?.id).toBe(6);
  });
});
