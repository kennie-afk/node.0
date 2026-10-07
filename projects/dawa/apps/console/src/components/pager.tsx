import Link from "next/link";

const linkClass = "rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-[0.75rem] font-medium text-[var(--color-ink)]";
const offClass = "rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[0.75rem] font-medium text-[var(--color-faint)]";

/**
 * Previous / next for a list. The caller builds the two links (null when there is no such page), so the same control
 * serves offset paging and the keyset paging used by append-only logs.
 */
export function Pager({ from, count, prev, next, noun = "rows" }: { from: number; count: number; prev: string | null; next: string | null; noun?: string }) {
  if (!prev && !next) return count > 0 ? <p className="mt-3 text-[0.75rem] text-[var(--color-faint)]">All {count} {noun} shown.</p> : null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <p className="text-[0.75rem] text-[var(--color-faint)]">{from > 0 ? `Showing ${from + 1} to ${from + count}` : `Showing ${count} ${noun}`}{next ? ", more follow" : ""}</p>
      <div className="flex gap-2">
        {prev ? <Link href={prev} className={linkClass}>Previous</Link> : <span className={offClass}>Previous</span>}
        {next ? <Link href={next} className={linkClass}>Next</Link> : <span className={offClass}>Next</span>}
      </div>
    </div>
  );
}
