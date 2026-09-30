/**
 * Keyset (cursor) pagination. OFFSET pages get slower the deeper they go and skip or repeat rows
 * when data changes underneath; a cursor is "the last row I saw", which costs the same on page
 * one and page ten thousand and never drifts. The cursor is opaque to clients.
 */
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined | null): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export interface KeysetPage<T> {
  data: T[];
  nextCursor: string | null;
  limit: number;
}

/** Given limit+1 fetched rows, trims the extra and builds the next cursor from the last kept row. */
export function toKeysetPage<T>(rows: T[], limit: number, cursorOf: (row: T) => unknown): KeysetPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, nextCursor: hasMore ? encodeCursor(cursorOf(data[data.length - 1])) : null, limit };
}
