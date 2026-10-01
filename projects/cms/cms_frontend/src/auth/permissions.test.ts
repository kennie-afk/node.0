import { describe, expect, it } from 'vitest';
import { can, canAny, effectiveRole } from './permissions';
import { decodeClaims } from './jwt';

function token(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

describe('permissions', () => {
  it('checks against the grants the server sent, not a local table', () => {
    const treasurer = ['finance:read', 'finance:post'];
    expect(can(treasurer, 'finance:post')).toBe(true);
    expect(can(treasurer, 'finance:approve')).toBe(false);
    expect(canAny(treasurer, ['finance:approve', 'finance:read'])).toBe(true);
    expect(can([], 'members:read')).toBe(false);
  });

  it('treats an old token that only has isAdmin as an administrator', () => {
    expect(effectiveRole(undefined, true)).toBe('ADMIN');
    expect(effectiveRole('TREASURER', false)).toBe('TREASURER');
    expect(effectiveRole(undefined, false)).toBe('MEMBER');
  });

  it('reads role and identity from a JWT payload without verifying it', () => {
    expect(decodeClaims(token({ id: 7, email: 'a@b.c', churchId: 3, role: 'TREASURER', isAdmin: false }))).toEqual({ id: 7, email: 'a@b.c', churchId: 3, role: 'TREASURER' });
    expect(decodeClaims(token({ id: 1, isAdmin: true })).role).toBe('ADMIN');
    expect(decodeClaims('garbage').role).toBe('MEMBER');
    expect(decodeClaims(null).role).toBe('MEMBER');
  });
});
