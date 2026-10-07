import { BadRequestError } from '../domain/errors';

/** A contains-pattern for LIKE with the user's own % _ and \ taken literally, lower-cased for lower(col) LIKE. */
export function likeContains(search: string): string {
  return `%${search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The digits of a member or loan number ('M100000' -> 100000), which is what lists page on. */
export function numberSeq(code: string): number {
  const digits = code.replace(/[^0-9]/g, '');
  const n = Number(digits);
  if (!digits || !Number.isSafeInteger(n)) throw new BadRequestError('That page cursor is not valid.');
  return n;
}

/** SQL that renders a timestamptz at full microsecond precision, for use as a cursor (a JS Date would truncate to ms and skip rows). */
export const cursorTs = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Opaque keyset cursor for (timestamp, id) pairs: base64url of "ts|id"; `at` comes from cursorTs() so it keeps microseconds. */
export function encodeCursor(at: string, id: string): string {
  return Buffer.from(`${at}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { at: string; id: string } {
  const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!at || !id || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(at) || !/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestError('That page cursor is not valid.');
  return { at, id };
}
