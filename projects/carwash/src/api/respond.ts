import { Response } from 'express';
import { encodeCursor, SortColumn } from '../persistence/paging';

/**
 * Sends a bounded list as a plain array (the shape every dropdown in the console reads) and, when
 * there are more rows, the cursor for the next page in the X-Next-Cursor header. `rows` is fetched
 * with limit + 1 so "is there more" costs nothing.
 */
export function sendArray<Row extends Record<string, any>, T>(
  res: Response,
  rows: Row[],
  limit: number,
  columns: SortColumn[],
  map: (row: Row) => T
): void {
  const more = rows.length > limit;
  const shown = more ? rows.slice(0, limit) : rows;
  const last = shown[shown.length - 1];
  if (more && last) {
    res.setHeader('X-Next-Cursor', encodeCursor(columns.map((_, index) => String(last[`k${index}`]))));
    res.setHeader('Access-Control-Expose-Headers', 'X-Next-Cursor');
  }
  res.json(shown.map(map));
}
