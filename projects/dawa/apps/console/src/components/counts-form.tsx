"use client";

import { useState, useTransition } from "react";
import { saveCounts } from "@/app/actions";
import { Badge, Notice, buttonClass, inputClass } from "@/components/ui";
import { ksh } from "@/lib/format";
import type { Stocktake } from "@/lib/types";

export function CountsForm({ take }: { take: Stocktake }) {
  const lines = take.lines ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.batchId, l.countedQty === null ? "" : String(l.countedQty)])));
  const [message, setMessage] = useState<{ tone: "good" | "danger"; text: string } | null>(null);
  const [working, start] = useTransition();

  function save() {
    const counts = lines.filter((l) => values[l.batchId] !== "" && values[l.batchId] !== undefined).map((l) => ({ batchId: l.batchId, countedQty: Number.parseInt(values[l.batchId]!, 10) })).filter((c) => Number.isInteger(c.countedQty) && c.countedQty >= 0);
    start(async () => {
      const out = await saveCounts(take.id!, counts);
      setMessage(out.error ? { tone: "danger", text: out.error } : { tone: "good", text: out.ok ?? "Saved." });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full text-[0.8125rem]">
          <thead><tr className="border-b border-[var(--color-line)] text-left text-[0.625rem] uppercase tracking-[0.06em] text-[var(--color-faint)]">{["Product", "Batch", "Expiry", "Expected", "Counted", "Difference"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {lines.map((l) => {
              const raw = values[l.batchId];
              const diff = raw === "" || raw === undefined ? null : Number.parseInt(raw, 10) - l.expectedQty;
              return (
                <tr key={l.batchId} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-3 py-2">{l.product} {l.category !== "otc" ? <Badge value={l.category} /> : null}</td>
                  <td className="px-3 py-2">{l.batchNo}</td>
                  <td className="px-3 py-2">{l.expiryDate}</td>
                  <td className="px-3 py-2 tabular-nums">{l.expectedQty}</td>
                  <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-20 text-right`} inputMode="numeric" value={raw ?? ""} onChange={(e) => setValues((v) => ({ ...v, [l.batchId]: e.target.value }))} aria-label={`Counted ${l.product} batch ${l.batchNo}`} /></td>
                  <td className={`px-3 py-2 tabular-nums ${diff ? "font-medium text-[var(--color-danger)]" : ""}`}>{diff === null || Number.isNaN(diff) ? "—" : diff > 0 ? `+${diff}` : diff}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex items-center gap-3"><button type="button" className={buttonClass} onClick={save} disabled={working}>{working ? "Saving…" : "Save counts"}</button><span className="text-[0.75rem] text-[var(--color-muted)]">Value of what is counted short is shown after a manager approves ({ksh(0).replace("0", "…")}).</span></div>
    </div>
  );
}
