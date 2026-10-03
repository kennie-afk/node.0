import { api } from "@/lib/api";

/** How many of something are waiting, without fetching them all: one page, and "100+" if there is more. */
export async function waiting(path: string, key: "items" | "list" = "items"): Promise<{ n: number; more: boolean } | null> {
  try {
    if (key === "list") {
      const rows = await api.get<unknown[]>(path);
      return { n: rows.length, more: rows.length >= 200 };
    }
    const page = await api.get<{ items: unknown[]; nextCursor?: string | null }>(path);
    return { n: page.items.length, more: Boolean(page.nextCursor) };
  } catch {
    return null;
  }
}
export const shown = (w: { n: number; more: boolean } | null) => (w === null ? "–" : `${w.n}${w.more ? "+" : ""}`);
