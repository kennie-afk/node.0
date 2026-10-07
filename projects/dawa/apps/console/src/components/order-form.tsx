"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrder, pickProducts, pickSuppliers } from "@/app/actions";
import { Picker } from "@/components/picker";
import { Notice, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { toCents } from "@/lib/format";

interface Row { key: string; productId: string; qty: string; cost: string }
const blank = (): Row => ({ key: Math.random().toString(36).slice(2), productId: "", qty: "", cost: "" });

/** Raise a purchase order: a supplier and what to order, at what cost. Nothing is owed until a delivery arrives against it. */
export function OrderForm() {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [result, setResult] = useState<{ error: string | null; ok: string | null } | null>(null);
  const [working, start] = useTransition();
  const valid = supplierId && rows.some((r) => r.productId && Number(r.qty) > 0);

  function submit() {
    setResult(null);
    start(async () => {
      const lines = rows.filter((r) => r.productId && Number(r.qty) > 0).map((r) => ({ productId: r.productId, qty: Number.parseInt(r.qty, 10), unitCostCents: toCents(r.cost) }));
      const out = await createOrder({ supplierId, expectedDate: expected || undefined, note: note || undefined, lines });
      setResult(out);
      if (!out.error && out.id) router.push(`/console/orders/${out.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Picker search={pickSuppliers} placeholder="Supplier: search by name" onPick={(o) => setSupplierId(o?.id ?? "")} />
        <input className={inputClass} type="date" aria-label="Expected on" value={expected} onChange={(e) => setExpected(e.target.value)} title="Expected on" />
        <input className={inputClass} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full text-[0.8125rem]">
          <thead><tr className="border-b border-[var(--color-line)] text-left text-[0.625rem] uppercase tracking-[0.06em] text-[var(--color-faint)]">{["Product", "Quantity", "Unit cost (KES)", ""].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const set = (patch: Partial<Row>) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <tr key={r.key} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="min-w-56 px-3 py-2"><Picker search={pickProducts} placeholder="Search for the product" onPick={(o) => set({ productId: o?.id ?? "" })} /></td>
                  <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-24 text-right`} inputMode="numeric" value={r.qty} onChange={(e) => set({ qty: e.target.value })} aria-label="Quantity" /></td>
                  <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-28 text-right`} inputMode="decimal" value={r.cost} onChange={(e) => set({ cost: e.target.value })} aria-label="Unit cost" /></td>
                  <td className="px-3 py-2"><button type="button" onClick={() => setRows((cur) => (cur.length > 1 ? cur.filter((_, j) => j !== i) : [blank()]))} className="rounded-md px-1.5 text-[var(--color-faint)]" aria-label="Remove line">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-[var(--color-line)] p-3"><button type="button" className={secondaryButtonClass} onClick={() => setRows((cur) => [...cur, blank()])}>Add a line</button></div>
      </div>
      {result?.error ? <Notice tone="danger">{result.error}</Notice> : null}
      {result?.ok ? <Notice tone="good">{result.ok}</Notice> : null}
      <div><button type="button" className={buttonClass} disabled={!valid || working} onClick={submit}>{working ? "Raising…" : "Raise order"}</button></div>
    </div>
  );
}
