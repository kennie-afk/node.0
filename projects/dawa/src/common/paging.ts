/** One page of a list: the caller asks for `limit` rows from `offset`; `next` is the offset to ask for next, or null at the end. */
export interface Page<T> {
  items: T[];
  hasMore: boolean;
  next: number | null;
}

/** Page size from the query string, never above `max`, so a client cannot ask for the whole table in one go. */
export const pageLimit = (value: unknown, fallback: number, max: number): number => Math.min(Math.max(1, Math.floor(Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback)), max);

/** Queries fetch `limit + 1` rows; the extra one says whether there is more without a second count query. */
export function toPage<T>(rows: T[], limit: number, offset: number): Page<T> {
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore, next: hasMore ? offset + limit : null };
}
