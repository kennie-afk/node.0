"use client";

import { useState, useTransition } from "react";
import { receiveDelivery, scanCode } from "@/app/actions";
import { Badge, Notice, buttonClass, inputClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { toCents } from "@/lib/format";
import type { Product, Supplier } from "@/lib/types";

interface Row { key: string; productId: string; batchNo: string; expiryDate: string; qty: string; cost: string; serials: string[] }
const blank = (): Row => ({ key: Math.random().toString(36).slice(2), productId: "", batchNo: "", expiryDate: "", qty: "", cost: "", serials: [] });
const today = () => new Date().toISOString().slice(0, 10);

export function ReceiveForm({ suppliers, products }: { suppliers: Supplier[]; products: Product[] }) {
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [scan, setScan] = useState("");
  const [note, setNote] = useState<{ tone: "danger" | "warn" | "good"; text: string } | null>(null);
  const [witness, setWitness] = useState({ phone: "", pin: "" });
  const [result, setResult] = useState<{ error: string | null; ok: string | null; warnings?: string[] } | null>(null);
  const [working, start] = useTransition();

  const byId = new Map(products.map((p) => [p.id, p]));
  const needsWitness = rows.some((r) => byId.get(r.productId)?.category === "controlled");

  async function onScan() {
    const input = scan.trim();
    if (!input) return;
    setScan("");
    const out = await scanCode(input);
    if (out.error || !out.result) return setNote({ tone: "danger", text: out.error ?? "That scan could not be read." });
    const { product, scan: s } = out.result;
    if (!product) return setNote({ tone: "warn", text: `GTIN ${s.gtin} is not in your catalogue. Add the product first, then scan again.` });
    if (!s.batchNo || !s.expiryDate) return setNote({ tone: "warn", text: `${product.name}: this is a retail barcode with no batch or expiry. Enter those by hand below.` });
    setRows((current) => {
      const at = current.findIndex((r) => r.productId === product.id && r.batchNo === s.batchNo && r.expiryDate === s.expiryDate);
      if (at >= 0) {
        const next = [...current];
        const row = { ...next[at]! };
        if (s.serial) {
          if (row.serials.includes(s.serial)) { setNote({ tone: "warn", text: `Serial ${s.serial} was already scanned in this delivery.` }); return current; }
          row.serials = [...row.serials, s.serial];
          row.qty = String(Math.max(Number(row.qty) || 0, row.serials.length));
        } else row.qty = String((Number(row.qty) || 0) + 1);
        next[at] = row;
        return next;
      }
      const fresh: Row = { key: Math.random().toString(36).slice(2), productId: product.id, batchNo: s.batchNo!, expiryDate: s.expiryDate!, qty: "1", cost: "", serials: s.serial ? [s.serial] : [] };
      return [...current.filter((r) => r.productId || r.batchNo), fresh];
    });
    setNote({ tone: "good", text: `${product.name} · batch ${s.batchNo} · expires ${s.expiryDate}` });
  }

  function submit() {
    setResult(null);
    startTransitionSafe();
  }
  function startTransitionSafe() {
    start(async () => {
      const lines = rows.filter((r) => r.productId).map((r) => ({
        productId: r.productId, batchNo: r.batchNo.trim(), expiryDate: r.expiryDate, qty: Number.parseInt(r.qty, 10) || 0, unitCostCents: toCents(r.cost), ...(r.serials.length ? { serials: r.serials } : {})
      }));
      const out = await receiveDelivery({ supplierId, invoiceNumber, invoiceDate, dueDate: dueDate || undefined, lines, ...(needsWitness ? { witness } : {}) });
      setResult(out);
      if (!out.error) { setRows([blank()]); setInvoiceNumber(""); setWitness({ phone: "", pin: "" }); }
    });
  }

  const valid = supplierId && invoiceNumber && rows.some((r) => r.productId && r.batchNo && r.expiryDate && Number(r.qty) > 0) && (!needsWitness || (witness.phone && witness.pin));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:grid-cols-4">
        <select className={selectClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier"><option value="">Supplier…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input className={inputClass} placeholder="Supplier invoice no." value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        <input className={inputClass} type="date" aria-label="Invoice date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        <input className={inputClass} type="date" aria-label="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} title="Due date" />
      </div>

      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <label className="block text-[0.8125rem] font-medium">Scan each pack (optional)</label>
        <input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onScan(); } }} className={inputClass} placeholder="Scan a GS1 DataMatrix: batch, expiry and serial fill themselves in" autoComplete="off" />
        {note ? <div className="mt-3"><Notice tone={note.tone}>{note.text}</Notice></div> : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full text-[0.8125rem]">
          <thead><tr className="border-b border-[var(--color-line)] text-left text-[0.625rem] uppercase tracking-[0.06em] text-[var(--color-faint)]">
            {["Product", "Batch", "Expiry", "Qty", "Unit cost (KES)", "Serials", ""].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const p = byId.get(r.productId);
              const set = (patch: Partial<Row>) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <tr key={r.key} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-3 py-2"><select className={`${selectClass} !mt-0 min-w-44`} value={r.productId} onChange={(e) => set({ productId: e.target.value })} aria-label="Product"><option value="">Choose…</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>{p && p.category !== "otc" ? <div className="mt-1"><Badge value={p.category} /></div> : null}</td>
                  <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-28`} value={r.batchNo} onChange={(e) => set({ batchNo: e.target.value })} aria-label="Batch number" /></td>
                  <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-36`} type="date" value={r.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} aria-label="Expiry date" /></td>
                  <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-20 text-right`} inputMode="numeric" value={r.qty} onChange={(e) => set({ qty: e.target.value })} aria-label="Quantity" /></td>
                  <td className="px-3 py-2"><input className={`${inputClass} !mt-0 w-24 text-right`} inputMode="decimal" value={r.cost} onChange={(e) => set({ cost: e.target.value })} aria-label="Unit cost" /></td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">{r.serials.length || "—"}</td>
                  <td className="px-3 py-2"><button type="button" onClick={() => setRows((cur) => (cur.length > 1 ? cur.filter((_, j) => j !== i) : [blank()]))} className="rounded-md px-1.5 text-[var(--color-faint)] hover:bg-[var(--color-raised)]" aria-label="Remove line">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-[var(--color-line)] p-3"><button type="button" className={secondaryButtonClass} onClick={() => setRows((cur) => [...cur, blank()])}>Add a line</button></div>
      </div>

      {needsWitness ? (
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <p className="text-[0.8125rem] font-medium">A controlled drug is on this delivery: a second person must confirm</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2"><input className={inputClass} placeholder="Witness phone" value={witness.phone} onChange={(e) => setWitness({ ...witness, phone: e.target.value })} /><input className={inputClass} type="password" inputMode="numeric" placeholder="Witness PIN" value={witness.pin} onChange={(e) => setWitness({ ...witness, pin: e.target.value })} /></div>
        </div>
      ) : null}

      {result?.error ? <Notice tone="danger">{result.error}</Notice> : null}
      {result?.ok ? <Notice tone="good">{result.ok}{result.warnings?.length ? ` Watch: ${result.warnings.join(" ")}` : ""}</Notice> : null}
      <div><button type="button" className={buttonClass} disabled={!valid || working} onClick={submit}>{working ? "Receiving…" : "Receive delivery"}</button></div>
    </div>
  );
}
