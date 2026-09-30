import { Transaction } from 'sequelize';
import db from '@models';
import { isPostgres } from '../../common/tenant-db';
import { select } from '../finance/sql';

const tableCache = new Map<string, boolean>();
const columnCache = new Map<string, boolean>();

/** Optional modules may not be installed in every deployment; reports degrade instead of failing. */
export async function tableExists(t: Transaction, table: string): Promise<boolean> {
  const hit = tableCache.get(table);
  if (hit !== undefined) return hit;
  const rows = isPostgres(db.sequelize)
    ? await select(t, `SELECT 1 AS x FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?`, [table])
    : await select(t, `SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
  const exists = rows.length > 0;
  tableCache.set(table, exists);
  return exists;
}

export async function columnExists(t: Transaction, table: string, column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  const hit = columnCache.get(key);
  if (hit !== undefined) return hit;
  const rows = isPostgres(db.sequelize)
    ? await select(t, `SELECT 1 AS x FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`, [table, column])
    : await select(t, `SELECT 1 AS x FROM pragma_table_info(?) WHERE name = ?`, [table, column]);
  const exists = rows.length > 0;
  columnCache.set(key, exists);
  return exists;
}

/** YYYY-MM out of a date or timestamp column, for either dialect. */
export function monthOf(column: string): string {
  return isPostgres(db.sequelize) ? `to_char(${column}, 'YYYY-MM')` : `substr(${column}, 1, 7)`;
}

/** Converts a NUMERIC(14,2) (string on Postgres, number on SQLite) to integer minor units. */
export function decimalToMinor(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) * 100);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
