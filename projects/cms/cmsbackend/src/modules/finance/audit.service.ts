import { Transaction } from 'sequelize';
import { currentTenantOrNull } from '../../common/tenant-context';
import { exec, select } from './sql';
import { GENESIS_HASH, iso, lockChain, sha256 } from './chain';
import { toInt } from '../../common/money';

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  data?: Record<string, unknown>;
  actorId?: number | null;
}

function canonical(data: unknown): string {
  // Key order must not depend on insertion order, or the same event hashes two ways.
  if (Array.isArray(data)) return `[${data.map(canonical).join(',')}]`;
  if (data && typeof data === 'object') {
    return `{${Object.keys(data as object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((data as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(data ?? null);
}

export function auditHash(prev: string, row: { churchId: number; seq: number; actorId: number | null; action: string; entityType: string; entityId: string | null; data: unknown; occurredAt: string }): string {
  return sha256(
    [prev, row.churchId, row.seq, row.actorId ?? '', row.action, row.entityType, row.entityId ?? '', canonical(row.data), row.occurredAt].join('|')
  );
}

/** Appends to the tamper-evident audit chain, in the caller's transaction. */
export async function recordAudit(t: Transaction, churchId: number, input: AuditInput): Promise<void> {
  const chain = await lockChain(t, churchId);
  const occurredAt = new Date();
  const actorId = input.actorId ?? currentTenantOrNull()?.userId ?? null;
  const entityId = input.entityId === undefined || input.entityId === null ? null : String(input.entityId);
  const data = input.data ?? {};
  const hash = auditHash(chain.lastAuditHash, {
    churchId,
    seq: chain.nextAuditSeq,
    actorId,
    action: input.action,
    entityType: input.entityType,
    entityId,
    data,
    occurredAt: occurredAt.toISOString()
  });
  await exec(
    t,
    `INSERT INTO audit_events (church_id, seq, actor_id, action, entity_type, entity_id, data, occurred_at, prev_hash, hash)
     VALUES (:churchId, :seq, :actorId, :action, :entityType, :entityId, :data, :occurredAt, :prev, :hash)`,
    {
      churchId,
      seq: chain.nextAuditSeq,
      actorId,
      action: input.action,
      entityType: input.entityType,
      entityId,
      data: JSON.stringify(data),
      occurredAt,
      prev: chain.lastAuditHash,
      hash
    }
  );
  await exec(
    t,
    `UPDATE finance_chain SET next_audit_seq = :next, last_audit_hash = :hash, updated_at = :now WHERE church_id = :churchId`,
    { next: chain.nextAuditSeq + 1, hash, now: occurredAt, churchId }
  );
}

export interface AuditVerification {
  ok: boolean;
  events: number;
  issues: string[];
}

/** Walks the whole audit chain in keyset batches and recomputes every hash. */
export async function verifyAuditChain(t: Transaction, churchId: number): Promise<AuditVerification> {
  const issues: string[] = [];
  let prev = GENESIS_HASH;
  let expected = 1;
  let count = 0;
  let after = 0;
  for (;;) {
    const rows = await select<any>(
      t,
      `SELECT seq, actor_id, action, entity_type, entity_id, data, occurred_at, prev_hash, hash
         FROM audit_events WHERE church_id = :churchId AND seq > :after ORDER BY seq LIMIT 1000`,
      { churchId, after }
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const seq = toInt(row.seq);
      count += 1;
      if (seq !== expected) issues.push(`audit sequence gap: expected ${expected}, found ${seq}`);
      expected = seq + 1;
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const recomputed = auditHash(prev, {
        churchId,
        seq,
        actorId: row.actor_id === null ? null : toInt(row.actor_id),
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        data,
        occurredAt: iso(row.occurred_at)
      });
      if (String(row.prev_hash).trim() !== prev) issues.push(`audit event ${seq} does not link to the previous event`);
      if (String(row.hash).trim() !== recomputed) issues.push(`audit event ${seq} has been altered`);
      prev = String(row.hash).trim();
      after = seq;
    }
  }
  const tail = await select<any>(t, `SELECT last_audit_hash, next_audit_seq FROM finance_chain WHERE church_id = :churchId`, { churchId });
  if (tail[0] && (String(tail[0].last_audit_hash).trim() !== prev || toInt(tail[0].next_audit_seq) !== expected)) {
    issues.push('audit chain head does not match the last event (events removed or appended out of band)');
  }
  return { ok: issues.length === 0, events: count, issues };
}
