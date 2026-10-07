import Link from "next/link";
import type { ReactNode } from "react";
import { inputClass, secondaryButtonClass, buttonClass, selectClass } from "@/components/ui";

type Params = Record<string, string | undefined>;

/** The current filters as a query string, dropping anything empty and the cursor. */
export function queryString(params: Params, extra: Params = {}): string {
  const merged = { ...params, ...extra };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/**
 * Filters as a plain GET form: no script, the URL is the state, so a filtered view can be bookmarked,
 * paged and exported. Fields are described as data to keep every list page short.
 */
export type FilterField =
  | { name: string; label: string; kind: "text"; placeholder?: string }
  | { name: string; label: string; kind: "date" }
  | { name: string; label: string; kind: "select"; options: { value: string; label: string }[] };

export function FilterBar({ fields, values, reset, hidden = {} }: { fields: FilterField[]; values: Params; reset: string; hidden?: Record<string, string> }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((field) => (
        <label key={field.name} className="block">
          <span className="block text-[0.6875rem] font-medium text-[var(--color-muted)]">{field.label}</span>
          {field.kind === "select" ? (
            <select name={field.name} defaultValue={values[field.name] ?? ""} className={`${selectClass} !mt-1 min-w-[8.5rem]`}>
              <option value="">Any</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={field.name}
              type={field.kind === "date" ? "date" : "text"}
              defaultValue={values[field.name] ?? ""}
              placeholder={field.kind === "text" ? field.placeholder : undefined}
              className={`${inputClass} !mt-1 w-[9.5rem]`}
            />
          )}
        </label>
      ))}
      <button type="submit" className={buttonClass}>
        Apply
      </button>
      <Link href={reset} className={secondaryButtonClass}>
        Clear
      </Link>
    </form>
  );
}

/**
 * Keyset paging only goes forward, because a cursor is "the rows after this one". "First page" is the way
 * back; the filters travel with every link.
 */
export function Pager({ base, params, next, shown }: { base: string; params: Params; next: string | null; shown: number }) {
  const onFirst = !params.after;
  if (onFirst && !next) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-[0.75rem] text-[var(--color-muted)]">
      <span>{shown} shown{next ? ", more after these" : onFirst ? "" : ", the end"}</span>
      <span className="flex items-center gap-2">
        {!onFirst ? (
          <Link href={`${base}${queryString(params, { after: undefined })}`} className={secondaryButtonClass}>
            First page
          </Link>
        ) : null}
        {next ? (
          <Link href={`${base}${queryString(params, { after: next })}`} className={secondaryButtonClass}>
            Next page
          </Link>
        ) : null}
      </span>
    </div>
  );
}

/** A link to the CSV export of exactly what the filters show (every row, not just this page). */
export function ExportLink({ kind, params, children }: { kind: string; params: Params; children?: ReactNode }) {
  return (
    <a href={`/console/export/${kind}${queryString(params, { after: undefined })}`} className={secondaryButtonClass}>
      {children ?? "Download CSV"}
    </a>
  );
}
