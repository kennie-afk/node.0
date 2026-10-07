/**
 * What the server currently believes about a signed-in account.
 *
 * A signed token used to be believed until it expired (12 hours by default), so a dismissed worker kept
 * working and a demoted manager kept their old role. Now every request compares the token with the
 * account row: it must still be active and its `tv` (token version) must equal the account's. Role and
 * site come from the row, never from the token, so a change of role takes effect on the next request.
 *
 * The row is cached for a few seconds so this does not become a query per request. A change made through
 * this process invalidates the entry at once; another replica sees it within SESSION_CACHE_SECONDS.
 */
import { withOrg } from '../persistence/pool';
import { env } from '../config/env';

export interface Account {
  status: string;
  role: 'owner' | 'manager' | 'supervisor' | 'worker' | 'support';
  siteId: string | null;
  tokenVersion: number;
}

export interface AccountCache {
  get(orgId: string, userId: string): Promise<Account | null>;
  invalidate(orgId: string, userId: string): void;
  clear(): void;
}

export function createAccountCache(
  load: (orgId: string, userId: string) => Promise<Account | null>,
  ttlMs: number,
  now: () => number = Date.now,
  maxEntries = 20_000
): AccountCache {
  const entries = new Map<string, { at: number; account: Account | null }>();
  return {
    async get(orgId, userId) {
      const key = `${orgId}:${userId}`;
      const hit = entries.get(key);
      if (hit && ttlMs > 0 && now() - hit.at < ttlMs) return hit.account;
      const account = await load(orgId, userId);
      if (ttlMs > 0) {
        if (entries.size >= maxEntries) entries.clear();
        entries.set(key, { at: now(), account });
      }
      return account;
    },
    invalidate(orgId, userId) {
      entries.delete(`${orgId}:${userId}`);
    },
    clear() {
      entries.clear();
    }
  };
}

async function loadAccount(orgId: string, userId: string): Promise<Account | null> {
  return withOrg(orgId, async (client) => {
    const { rows } = await client.query('SELECT status, role, site_id, token_version FROM users WHERE id = $1', [userId]);
    const row = rows[0];
    return row ? { status: row.status, role: row.role, siteId: row.site_id, tokenVersion: Number(row.token_version) } : null;
  });
}

export const accounts = createAccountCache(loadAccount, env.SESSION_CACHE_SECONDS * 1000);

/** True when the token still describes the account: it exists, is active, and has not been revoked. */
export function tokenIsCurrent(account: Account | null, tokenVersion: unknown): account is Account {
  return account !== null && account.status === 'active' && account.tokenVersion === (typeof tokenVersion === 'number' ? tokenVersion : 0);
}
