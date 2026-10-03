export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export async function sp(params: SearchParams): Promise<Record<string, string>> {
  const raw = await params;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  return out;
}
/** A link to the same page with some query values changed. */
export function link(base: string, current: Record<string, string>, change: Record<string, string | number | null>): string {
  const q = new URLSearchParams();
  const merged: Record<string, string | number | null> = { ...current, ...change };
  for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "" && v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
export const pageOf = (q: Record<string, string>) => Math.max(1, Number(q.page) || 1);
