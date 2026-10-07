/**
 * Exporting the audit/ledger chain heads to somewhere the database owner cannot edit.
 *
 * The hash chains make tampering evident only against a head the attacker cannot also rewrite. A
 * superuser on the database host can change rows AND recompute every later hash AND update the
 * `finance_chain` head row, and `verifyLedger` would still pass. A head written elsewhere (object
 * store, a webhook to a witness) pins history: any edit at or before the exported position changes
 * the hash stored at that position, and the check below sees the difference.
 *
 * The check reads the position's hash from the real `journal_entries` / `audit_events` rows, never
 * from `finance_chain`, because the head row is part of what an attacker can rewrite.
 */
import { Transaction } from 'sequelize';
import { env } from '../../config/env';
import { objectStore, sha256 as sha256Bytes, tenantKey } from '../../common/object-store';
import { toInt } from '../../common/money';
import { GENESIS_HASH } from './chain';
import { selectOne } from './sql';

export interface ChainHead {
  version: 1;
  churchId: number;
  takenAt: string;
  ledger: { entries: number; hash: string };
  audit: { events: number; hash: string };
  /** sha256 over the fields above, so a damaged or hand-edited file is noticed before it is trusted. */
  digest: string;
}

export interface HeadCheck {
  ok: boolean;
  issues: string[];
}

const digestOf = (h: Omit<ChainHead, 'digest'>) =>
  sha256Bytes(JSON.stringify([h.version, h.churchId, h.takenAt, h.ledger.entries, h.ledger.hash, h.audit.events, h.audit.hash]));

/** The head as the chains themselves hold it: last entry and last audit event actually present. */
export async function currentHead(t: Transaction, churchId: number, now: Date = new Date()): Promise<ChainHead> {
  const entry = await selectOne<any>(t, `SELECT entry_no, hash FROM journal_entries WHERE church_id = :churchId ORDER BY entry_no DESC LIMIT 1`, { churchId });
  const event = await selectOne<any>(t, `SELECT seq, hash FROM audit_events WHERE church_id = :churchId ORDER BY seq DESC LIMIT 1`, { churchId });
  const body = {
    version: 1 as const,
    churchId,
    takenAt: now.toISOString(),
    ledger: { entries: entry ? toInt(entry.entry_no) : 0, hash: entry ? String(entry.hash).trim() : GENESIS_HASH },
    audit: { events: event ? toInt(event.seq) : 0, hash: event ? String(event.hash).trim() : GENESIS_HASH }
  };
  return { ...body, digest: digestOf(body) };
}

/** Compares a previously exported head with what the database holds at the same positions. */
export async function checkHeadAgainstDatabase(t: Transaction, churchId: number, stored: ChainHead): Promise<HeadCheck> {
  const issues: string[] = [];
  if (stored.churchId !== churchId) issues.push(`the exported head belongs to church ${stored.churchId}, not ${churchId}`);
  if (stored.digest !== digestOf(stored)) issues.push('the exported head file has been altered (its digest does not match)');
  if (issues.length > 0) return { ok: false, issues };

  if (stored.ledger.entries > 0) {
    const row = await selectOne<any>(t, `SELECT hash FROM journal_entries WHERE church_id = :churchId AND entry_no = :n`, { churchId, n: stored.ledger.entries });
    if (!row) issues.push(`ledger entry ${stored.ledger.entries} (exported ${stored.takenAt}) is missing: history was removed`);
    else if (String(row.hash).trim() !== stored.ledger.hash) issues.push(`ledger entry ${stored.ledger.entries} no longer has the hash exported on ${stored.takenAt}: history was rewritten`);
  }
  if (stored.audit.events > 0) {
    const row = await selectOne<any>(t, `SELECT hash FROM audit_events WHERE church_id = :churchId AND seq = :n`, { churchId, n: stored.audit.events });
    if (!row) issues.push(`audit event ${stored.audit.events} (exported ${stored.takenAt}) is missing: history was removed`);
    else if (String(row.hash).trim() !== stored.audit.hash) issues.push(`audit event ${stored.audit.events} no longer has the hash exported on ${stored.takenAt}: history was rewritten`);
  }
  return { ok: issues.length === 0, issues };
}

export const headKey = (churchId: number, name: string) => tenantKey(churchId, 'chain-heads', name);

/** Writes the head to the object store (dated copy plus `latest`), then tells the webhook if one is configured. */
export async function exportHead(head: ChainHead, post: typeof fetch = fetch): Promise<{ key: string; webhook: 'sent' | 'not-configured' }> {
  const body = Buffer.from(JSON.stringify(head, null, 2));
  const store = objectStore();
  const key = headKey(head.churchId, `${head.takenAt.slice(0, 10)}.json`);
  await store.put(key, body, 'application/json');
  await store.put(headKey(head.churchId, 'latest.json'), body, 'application/json');
  if (!env.CHAIN_HEAD_WEBHOOK) return { key, webhook: 'not-configured' };
  const res = await post(env.CHAIN_HEAD_WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cms-event': 'chain-head' },
    body: body.toString('utf8'),
    signal: AbortSignal.timeout(10_000)
  });
  // A failure throws, so the job retries with backoff; the object-store writes above are idempotent.
  if (!res.ok) throw new Error(`chain head webhook answered ${res.status}`);
  return { key, webhook: 'sent' };
}

export async function loadExportedHead(churchId: number, name = 'latest.json'): Promise<ChainHead | null> {
  const object = await objectStore().get(headKey(churchId, name));
  if (!object) return null;
  try {
    return JSON.parse(object.body.toString('utf8')) as ChainHead;
  } catch {
    return null;
  }
}
