/**
 * Keyset paging. OFFSET gets slower the deeper the page and skips or repeats rows when data arrives
 * while someone is reading, so every list asks for "the rows after this one" instead.
 *
 * A cursor is the sort key of the last row served, as TEXT. Timestamps are kept as the text Postgres
 * prints (microseconds included) because a JavaScript Date has only milliseconds, and two rows
 * created in the same millisecond would otherwise be skipped or served twice at a page boundary.
 */
import { BadRequestError } from '../domain/errors';

export interface SortColumn {
  /** SQL expression for the column, e.g. `j.created_at`. Never user input. */
  sql: string;
  dir: 'asc' | 'desc';
  /** Postgres type the cursor text is cast back to, e.g. `timestamptz`, `int`, `bigint`, `date`, `uuid`. */
  type: string;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function parseLimit(raw: unknown, fallback = DEFAULT_LIMIT, max = MAX_LIMIT): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new BadRequestError('limit must be a whole number of at least 1');
  return Math.min(value, max);
}

export function encodeCursor(values: string[]): string {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

export function decodeCursor(raw: unknown, width: number): string[] | null {
  if (raw === undefined || raw === '' || raw === null) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === width && parsed.every((item) => typeof item === 'string')) {
      return parsed as string[];
    }
  } catch {
    // fall through
  }
  throw new BadRequestError('after is not a valid cursor');
}

export function orderBy(columns: SortColumn[]): string {
  return columns.map((column) => `${column.sql} ${column.dir.toUpperCase()}`).join(', ');
}

/** `SELECT` fragment that exposes every sort column as text under k0, k1, ... */
export function keySelect(columns: SortColumn[]): string {
  return columns.map((column, index) => `(${column.sql})::text AS k${index}`).join(', ');
}

/**
 * The WHERE fragment that selects rows strictly after `cursor` in the given order, expanded as
 * (a < x) OR (a = x AND b < y) OR ... so that mixed ascending and descending columns work and the
 * composite index can still be used. Parameters are appended to `params`.
 */
export function afterClause(columns: SortColumn[], cursor: string[] | null, params: unknown[]): string | null {
  if (!cursor) return null;
  const refs = cursor.map((value, index) => {
    params.push(value);
    return `$${params.length}::${columns[index]!.type}`;
  });
  const branches = columns.map((column, index) => {
    const equal = columns.slice(0, index).map((previous, at) => `${previous.sql} = ${refs[at]}`);
    const beyond = `${column.sql} ${column.dir === 'desc' ? '<' : '>'} ${refs[index]}`;
    return `(${[...equal, beyond].join(' AND ')})`;
  });
  return `(${branches.join(' OR ')})`;
}

export interface Page<T> {
  items: T[];
  next: string | null;
}

/** Trims the extra row fetched to learn whether there is another page, and builds the cursor. */
export function finishPage<Row extends Record<string, any>, T>(
  rows: Row[],
  limit: number,
  columns: SortColumn[],
  map: (row: Row) => T
): Page<T> {
  const more = rows.length > limit;
  const shown = more ? rows.slice(0, limit) : rows;
  const last = shown[shown.length - 1];
  return {
    items: shown.map(map),
    next: more && last ? encodeCursor(columns.map((_, index) => String(last[`k${index}`]))) : null
  };
}

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** An optional YYYY-MM-DD filter; a malformed one is a mistake worth reporting, not ignoring. */
export function optionalDay(raw: unknown, name: string): string | null {
  if (raw === undefined || raw === '') return null;
  if (!isDay(raw)) throw new BadRequestError(`${name} must be a day written YYYY-MM-DD`);
  return raw;
}

export function optionalUuid(raw: unknown, name: string): string | null {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    throw new BadRequestError(`${name} must be an id`);
  }
  return raw;
}

export function optionalOneOf<T extends string>(raw: unknown, name: string, allowed: readonly T[]): T | null {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
    throw new BadRequestError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return raw as T;
}
