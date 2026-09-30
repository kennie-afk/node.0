import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../api/http';
import { explainCheckoutFailure, PICKUP_CODE } from './checkout';

describe('explainCheckoutFailure', () => {
  it('recognises a wrong code', () => {
    expect(explainCheckoutFailure(new ApiError('the pickup code does not match', 403))).toMatchObject({ kind: 'wrong-code', locked: false });
  });
  it('recognises a lockout', () => {
    expect(explainCheckoutFailure(new ApiError('too many wrong codes; the session is locked', 403))).toMatchObject({ kind: 'wrong-code', locked: true });
  });
  it('recognises an unauthorised guardian', () => {
    expect(explainCheckoutFailure(new ApiError('Uncle Bob is not an authorised pickup for this child', 403)).kind).toBe('not-authorised');
  });
  it('falls back for anything else', () => {
    expect(explainCheckoutFailure(new Error('boom')).kind).toBe('other');
  });
  it('accepts exactly six digits', () => {
    expect(PICKUP_CODE.test('012345')).toBe(true);
    expect(PICKUP_CODE.test('12345')).toBe(false);
    expect(PICKUP_CODE.test('12345a')).toBe(false);
  });
});
