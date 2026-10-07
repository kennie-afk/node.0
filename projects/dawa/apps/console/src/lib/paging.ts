/** Page size for lists in the console. The API caps every page, so a list is always walked, never fetched whole. */
export const PAGE = 50;

/** A non-negative whole number from a query string, or 0. */
export function whole(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** A link to a path with the given query parameters; empty ones are left out. */
export function href(path: string, params: Record<string, string | number | undefined>): string {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "" && v !== 0)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return query ? `${path}?${query}` : path;
}
