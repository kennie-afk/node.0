import { createHash } from 'node:crypto';
import { Transaction } from 'sequelize';
import { exec, forUpdate, select } from './sql';
import { toInt } from '../../common/money';

export const GENESIS_HASH = '0'.repeat(64);

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** JS Date -> ISO, from whatever the driver handed back (Date on Postgres, string on SQLite). */
export function iso(value: unknown): string {
  return new Date(value as string | number | Date).toISOString();
}

/** YYYY-MM-DD from a DATE column, regardless of driver. */
export function dateOnly(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return (value as Date).toISOString().slice(0, 10);
}

export interface ChainState {
  nextEntryNo: number;
  lastEntryHash: string;
  nextAuditSeq: number;
  lastAuditHash: string;
}

/**
 * Takes the per-church write lock. Every ledger posting and audit append in a church queues
 * behind this one row, which is what keeps entry numbers gapless and the hash chains linear.
 * Churches never contend with each other.
 */
export async function lockChain(t: Transaction, churchId: number): Promise<ChainState> {
  const read = () =>
    select<any>(
      t,
      `SELECT next_entry_no, last_entry_hash, next_audit_seq, last_audit_hash
         FROM finance_chain WHERE church_id = :churchId ${forUpdate()}`,
      { churchId }
    );
  let rows = await read();
  if (rows.length === 0) {
    await exec(t, `INSERT INTO finance_chain (church_id) VALUES (:churchId) ON CONFLICT (church_id) DO NOTHING`, { churchId });
    rows = await read();
  }
  const row = rows[0];
  return {
    nextEntryNo: toInt(row.next_entry_no),
    lastEntryHash: String(row.last_entry_hash).trim(),
    nextAuditSeq: toInt(row.next_audit_seq),
    lastAuditHash: String(row.last_audit_hash).trim()
  };
}

/** Gap-tolerant named sequence (receipts, bills, batches). Inherits the caller's transaction. */
export async function nextCounter(t: Transaction, churchId: number, name: string): Promise<number> {
  await exec(
    t,
    `INSERT INTO finance_counters (church_id, name, value) VALUES (:churchId, :name, 0) ON CONFLICT (church_id, name) DO NOTHING`,
    { churchId, name }
  );
  await exec(t, `UPDATE finance_counters SET value = value + 1 WHERE church_id = :churchId AND name = :name`, { churchId, name });
  const rows = await select<any>(t, `SELECT value FROM finance_counters WHERE church_id = :churchId AND name = :name`, { churchId, name });
  return toInt(rows[0].value);
}
