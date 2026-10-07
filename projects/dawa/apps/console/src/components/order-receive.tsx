"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveOrder } from "@/app/actions";
import { Badge, Notice, buttonClass, inputClass } from "@/components/ui";
import { toCents } from "@/lib/format";
import type { PurchaseOrder } from "@/lib/types";

interface Entry { qty: string; batchNo: string; expiryDate: string; cost: string }
const today = () => new Date().toISOString().slice(0, 10);

/** Book a delivery against an open order: one batch per line this time (receive the rest in a later delivery). */
export function OrderReceive({ order }: { order: PurchaseOrder }) {
  const router = useRouter();
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [witness, setWitness] = useState({ phone: "", pin: "" });
  const [result, setResult] = useState<{ error: string | null; ok: string | null } | null>(null);
  const [working, start] = useTransition();

  const open = order.lines.filter((l) => l.qtyOrdered > l.qtyReceived);
  const get = (id: string): Entry => entries[id] ?? { qty: "", batchNo: "", expiryDate: "", cost: "" };
  const set = (id: string, patch: Partial<Entry>) => setEntries((cur) => ({ ...cur, [id]: { ...get(id), ...patch } }));
  const filled = open.filter((l) => Number(get(l.id).qty) > 0);
  const needsWitness = filled.some((l) => l.category === "controlled");
  const valid = invoiceNumber && filled.length > 0 && filled.every((l) => get(l.id).batchNo && get(l.id).expiryDate) && (!needsWitness || (witness.phone && witness.pin));

  function submit() {
    setResult(null);
    start(async () => {
      const out = await receiveOrder({
        orderId: order.id, invoiceNumber, invoiceDate, dueDate: dueDate || undefined,
        lines: filled.map((l) => { const e = get(l.id); return { lineId: l.id, batchNo: e.batchNo.trim(), expiryDate: e.expiryDate, qty: Number.parseInt(e.qty, 10), ...(e.cost ? { unitCostCents: toCents(e.cost) } : {}) }; }),
        ...(needsWitness ? { witness } : {})
      });
      setResult(out);
      if (!out.error) { setEntries({}); setInvoiceNumber(""); router.refresh(); }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <input className={inputClass} placeholder="Supplier invoice no." value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        <input className={inputClass} type="date" aria-label="Invoice date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        <input className={inputClass} type="date" aria-label="Due date" title="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-line)]">
        <table className="w-full text-[0.8125rem]">
          <thead><tr className="border-b border-[var(--color-line)] text-left text-[0.625rem] uppercase tracking-[0.06em] text-[var(--color-faint)]">{["Product", "Still to come", "Arrived now", "Batch", "Expiry", "Unit cost (KES)"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {open.map((l) => (
              <tr key={l.id} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-3 py-2">{l.product} {l.category !== "otc" ? <Badge value={l.category} /> : null}</td>
                <td className="px-3 py-2 tabular-nums">{l.qtyOrdered - l.qtyReceived}</td>
                <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-20 text-right`} inputMode="numeric" value={get(l.id).qty} onChange={(e) => set(l.id, { qty: e.target.value })} aria-label="Quantity arrived" /></td>
                <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-28`} value={get(l.id).batchNo} onChange={(e) => set(l.id, { batchNo: e.target.value })} aria-label="Batch number" /></td>
                <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-36`} type="date" value={get(l.id).expiryDate} onChange={(e) => set(l.id, { expiryDate: e.target.value })} aria-label="Expiry date" /></td>
                <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-24 text-right`} inputMode="decimal" placeholder={(l.unitCostCents / 100).toString()} value={get(l.id).cost} onChange={(e) => set(l.id, { cost: e.target.value })} aria-label="Unit cost" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {needsWitness ? (
        <div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} placeholder="Witness phone (controlled drug)" value={witness.phone} onChange={(e) => setWitness({ ...witness, phone: e.target.value })} /><input className={inputClass} type="password" inputMode="numeric" placeholder="Witness PIN" value={witness.pin} onChange={(e) => setWitness({ ...witness, pin: e.target.value })} /></div>
      ) : null}
      {result?.error ? <Notice tone="danger">{result.error}</Notice> : null}
      {result?.ok ? <Notice tone="good">{result.ok}</Notice> : null}
      <div><button type="button" className={buttonClass} disabled={!valid || working} onClick={submit}>{working ? "Booking…" : "Book the delivery"}</button></div>
    </div>
  );
}
