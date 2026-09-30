import { effectiveRole, type Role } from './permissions';

export interface TokenClaims {
  id: number | null;
  email: string | null;
  churchId: number | null;
  role: Role;
}

/**
 * Reads the claims out of a JWT WITHOUT verifying it. That is fine for deciding what to show;
 * the server verifies the signature on every request, so a forged token gets a menu and nothing
 * else.
 */
export function decodeClaims(token: string | null | undefined): TokenClaims {
  const empty: TokenClaims = { id: null, email: null, churchId: null, role: 'MEMBER' };
  if (!token) return empty;
  try {
    const payload = token.split('.')[1];
    if (!payload) return empty;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    const claims = JSON.parse(json) as Record<string, unknown>;
    return {
      id: typeof claims.id === 'number' ? claims.id : null,
      email: typeof claims.email === 'string' ? claims.email : null,
      churchId: typeof claims.churchId === 'number' ? claims.churchId : null,
      role: effectiveRole(claims.role, claims.isAdmin === true)
    };
  } catch {
    return empty;
  }
}
