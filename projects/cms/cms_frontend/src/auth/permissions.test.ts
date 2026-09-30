import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { can, effectiveRole, PERMISSIONS, ROLES } from './permissions';
import { decodeClaims } from './jwt';

function token(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

describe('permissions', () => {
  it('gives each role what the matrix says', () => {
    expect(can('ADMIN', 'users:manage')).toBe(true);
    expect(can('TREASURER', 'finance:post')).toBe(true);
    expect(can('TREASURER', 'finance:approve')).toBe(false);
    expect(can('AUDITOR', 'finance:post')).toBe(false);
    expect(can('AUDITOR', 'audit:read')).toBe(true);
    expect(can('MEMBER', 'members:read')).toBe(false);
  });

  it('treats an old token that only has isAdmin as an administrator', () => {
    expect(effectiveRole(undefined, true)).toBe('ADMIN');
    expect(effectiveRole('TREASURER', false)).toBe('TREASURER');
    expect(effectiveRole('bogus', false)).toBe('MEMBER');
  });

  it('reads role and identity from a JWT payload without verifying it', () => {
    expect(decodeClaims(token({ id: 7, email: 'a@b.c', churchId: 3, role: 'TREASURER', isAdmin: false }))).toEqual({ id: 7, email: 'a@b.c', churchId: 3, role: 'TREASURER' });
    expect(decodeClaims(token({ id: 1, isAdmin: true })).role).toBe('ADMIN');
    expect(decodeClaims('garbage').role).toBe('MEMBER');
    expect(decodeClaims(null).role).toBe('MEMBER');
  });

  // The console mirrors the backend matrix. When the backend source is next to this repo, prove they agree.
  const backend = resolve(__dirname, '../../../cmsbackend/src/auth/permissions.ts');
  it.runIf(existsSync(backend))('matches the backend role matrix exactly', () => {
    const source = readFileSync(backend, 'utf8');
    const list = (name: string) => [...source.match(new RegExp(`${name} = \\[([^\\]]*)\\]`))![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...ROLES]).toEqual(list('ROLES'));
    expect([...PERMISSIONS]).toEqual(list('PERMISSIONS'));
    const block = source.slice(source.indexOf('const MATRIX'));
    for (const role of ROLES) {
      const granted = role === 'ADMIN' ? [...PERMISSIONS] : [...block.match(new RegExp(`\\b${role}: \\[([^\\]]*)\\]`))![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      for (const permission of PERMISSIONS) expect(can(role, permission), `${role} ${permission}`).toBe(granted.includes(permission));
    }
  });
});
