import { fromMinor, toInt } from '../../common/money';
import { dateOnly } from '../finance/chain';

export const bool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 't';

/** A DECIMAL(14,2) column (string on Postgres, number on SQLite) as integer minor units. */
export function minorOf(amount: unknown): number {
  return Math.round(Number(amount ?? 0) * 100);
}

export type Frequency = 'ONE_TIME' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

function addMonthsClamped(date: string, months: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1;
  const d = Number(date.slice(8, 10));
  const total = y * 12 + m + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** The k-th due date of a schedule that started on `start` (computed from the start, so month-ends never drift). */
export function dueDate(start: string, frequency: Frequency, k: number): string {
  switch (frequency) {
    case 'ONE_TIME':
      return start;
    case 'WEEKLY': {
      const t = new Date(`${start}T00:00:00Z`);
      t.setUTCDate(t.getUTCDate() + 7 * k);
      return t.toISOString().slice(0, 10);
    }
    case 'MONTHLY':
      return addMonthsClamped(start, k);
    case 'QUARTERLY':
      return addMonthsClamped(start, 3 * k);
    case 'ANNUAL':
      return addMonthsClamped(start, 12 * k);
  }
}

/** How many installments have fallen due on or before `asOf` (and the optional end date). */
export function installmentsDue(start: string, frequency: Frequency, asOf: string, end?: string | null): number {
  const limit = end && end < asOf ? end : asOf;
  if (limit < start) return 0;
  if (frequency === 'ONE_TIME') return 1;
  let k = 0;
  while (k < 5000 && dueDate(start, frequency, k) <= limit) k += 1;
  return k;
}

export const today = () => new Date().toISOString().slice(0, 10);
export { fromMinor, toInt, dateOnly };

// ---- portable INSERT ... RETURNING id -----------------------------------------------------
// Postgres returns the id with RETURNING; the SQLite driver instead reports lastID for a plain
// insert, and cannot read rows back from an INSERT. Both paths live here so the services stay clean.
import { Transaction } from 'sequelize';
import db from '@models';
import { isPostgres } from '../../common/tenant-db';
import { select } from '../finance/sql';

export async function insertReturningId(t: Transaction, sql: string, params: Record<string, unknown>): Promise<number> {
  if (isPostgres(db.sequelize)) {
    const rows = await select<{ id: number }>(t, `${sql} RETURNING id`, params);
    return toInt(rows[0].id);
  }
  await db.sequelize.query(sql, { transaction: t, replacements: params as any });
  // SQLite has one writer and one connection per transaction, so this is the row just inserted.
  const rows = await select<{ id: number }>(t, 'SELECT last_insert_rowid() AS id');
  return toInt(rows[0].id);
}

/**
 * An insert that silently does nothing on a unique conflict. Resolves to the new id, or null when
 * the row already existed (which is how callers tell a retry from the first delivery).
 */
export async function insertIgnoringConflict(
  t: Transaction,
  sql: string,
  params: Record<string, unknown>,
  alreadyThere: () => Promise<boolean>
): Promise<number | null> {
  if (isPostgres(db.sequelize)) {
    const rows = await select<{ id: number }>(t, `${sql} RETURNING id`, params);
    return rows.length === 0 ? null : toInt(rows[0].id);
  }
  if (await alreadyThere()) return null;
  return insertReturningId(t, sql, params);
}
