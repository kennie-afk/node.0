/**
 * A tiny per-process cache for expensive read-only views (the dashboard). Entries live for a few seconds, concurrent misses share one
 * computation, and a write by the same organisation through this process drops that organisation's entries at once. Other replicas
 * serve their own copy until it expires, so the time-to-live is the most a figure can be stale there.
 * Off in the test environment (NODE_ENV=test) unless a test turns it on with setCacheTtl.
 */
import { env } from '../config/env';

interface Entry { at: number; value?: unknown; pending?: Promise<unknown> }

const MAX_ENTRIES = 5000;
const entries = new Map<string, Entry>();
let ttlMs = env.NODE_ENV === 'test' ? 0 : env.DASHBOARD_CACHE_SECONDS * 1000;

export function setCacheTtl(ms: number): void {
  ttlMs = ms;
  entries.clear();
}

/** Keys are `${orgId}|rest`, so one prefix drops everything an organisation has cached. */
export function invalidateOrg(orgId: string): void {
  const prefix = `${orgId}|`;
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
}

export async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  if (ttlMs <= 0) return compute();
  const hit = entries.get(key);
  const now = Date.now();
  if (hit && hit.pending) return hit.pending as Promise<T>;
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  const pending = compute().then(
    (value) => {
      // a write may have dropped the entry while this was computing: only store if it is still ours
      if (entries.get(key)?.pending === pending) entries.set(key, { at: Date.now(), value });
      return value;
    },
    (error) => {
      if (entries.get(key)?.pending === pending) entries.delete(key);
      throw error;
    }
  );
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  entries.set(key, { at: now, pending });
  return pending;
}
