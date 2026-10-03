import type { Flag } from "@/lib/types";

const TONE: Record<Flag["severity"], string> = {
  info: "border-[var(--color-line)] bg-[var(--color-raised)] text-[var(--color-muted)]",
  warn: "border-[#f0dfbd] bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  high: "border-[#f5cdcb] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
};

/** Flags are prompts for a person to look closer. The wording never calls anything fraud or verified. */
export function FlagList({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return <p className="text-[0.75rem] text-[var(--color-muted)]">No flags. That does not make the document genuine.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {flags.map((f) => (
        <li key={f.code} className={`rounded-md border px-3 py-1.5 text-[0.75rem] ${TONE[f.severity]}`}><strong className="uppercase tracking-wide">{f.severity}</strong> · {f.message}</li>
      ))}
    </ul>
  );
}
