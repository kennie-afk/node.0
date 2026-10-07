"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { pickCustomers, scanCode, searchProducts, submitSale, type SaleOutcome } from "@/app/actions";
import { Picker } from "@/components/picker";
import { Badge, Notice, buttonClass, inputClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { ksh, toCents } from "@/lib/format";
import type { Product } from "@/lib/types";

interface Line {
  productId: string;
  name: string;
  category: Product["category"];
  unitPriceCents: number;
  qty: number;
  serials: string[];
}

const EMPTY_RX = { patientName: "", patientPhone: "", patientAgeYears: "", patientSex: "", prescriberName: "", prescriberRegNo: "", prescriptionRef: "", directions: "" };

export function Pos({ canDiscount }: { canDiscount: boolean }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [scan, setScan] = useState("");
  const [note, setNote] = useState<{ tone: "danger" | "warn" | "good"; text: string } | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  const [method, setMethod] = useState<"cash" | "mpesa" | "credit">("cash");
  const [tendered, setTendered] = useState("");
  const [mpesaCode, setMpesaCode] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [rx, setRx] = useState(EMPTY_RX);
  const [witness, setWitness] = useState({ phone: "", pin: "" });
  const [outcome, setOutcome] = useState<SaleOutcome | null>(null);
  const [working, startWork] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.qty * l.unitPriceCents, 0), [lines]);
  const discountCents = canDiscount ? toCents(discount) : 0;
  const total = Math.max(0, subtotal - discountCents);
  const needsRx = lines.some((l) => l.category !== "otc");
  const needsWitness = lines.some((l) => l.category === "controlled");

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const timer = setTimeout(() => { searchProducts(q).then(setResults).catch(() => setResults([])); }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  function add(product: Product, serial?: string) {
    setLines((current) => {
      const at = current.findIndex((l) => l.productId === product.id);
      if (at === -1) {
        return [...current, { productId: product.id, name: product.name, category: product.category, unitPriceCents: product.listPriceCents, qty: 1, serials: serial ? [serial] : [] }];
      }
      const next = [...current];
      const line = { ...next[at]! };
      if (serial) {
        if (line.serials.includes(serial)) return current;
        line.serials = [...line.serials, serial];
        line.qty = line.serials.length;
      } else if (line.serials.length === 0) {
        line.qty += 1;
      }
      next[at] = line;
      return next;
    });
  }

  async function onScan() {
    const input = scan.trim();
    if (!input) return;
    setScan("");
    const out = await scanCode(input);
    if (out.error || !out.result) { setNote({ tone: "danger", text: out.error ?? "That scan could not be read." }); return; }
    const { product, serialStatus, scan: parsed, inDate } = out.result;
    if (!product) { setNote({ tone: "warn", text: `Not in your catalogue (GTIN ${parsed.gtin}). Add it under Products first.` }); return; }
    if (serialStatus === "sold") { setNote({ tone: "danger", text: `This exact pack (serial ${parsed.serial}) has ALREADY BEEN SOLD. Set it aside and tell the manager.` }); return; }
    if (serialStatus === "unknown") { setNote({ tone: "danger", text: `Serial ${parsed.serial} was never received here. Do not sell it: it may not be genuine stock.` }); return; }
    if (inDate <= 0) { setNote({ tone: "danger", text: `${product.name}: nothing in date on the shelf.` }); return; }
    add(product, parsed.serial ?? undefined);
    setNote({ tone: "good", text: `${product.name} added${parsed.expiryDate ? ` (expires ${parsed.expiryDate})` : ""}.` });
  }

  function reset() {
    setLines([]); setQuery(""); setResults([]); setCustomerId(""); setPickerKey((k) => k + 1); setTendered(""); setMpesaCode(""); setDiscount(""); setDiscountReason(""); setRx(EMPTY_RX); setWitness({ phone: "", pin: "" }); setMethod("cash");
    scanRef.current?.focus();
  }

  function complete() {
    setOutcome(null);
    const dispensing = needsRx ? {
      patientName: rx.patientName, patientPhone: rx.patientPhone || undefined, patientAgeYears: rx.patientAgeYears ? Number(rx.patientAgeYears) : undefined,
      patientSex: rx.patientSex || undefined, prescriberName: rx.prescriberName, prescriberRegNo: rx.prescriberRegNo || undefined, prescriptionRef: rx.prescriptionRef || undefined, directions: rx.directions || undefined
    } : undefined;
    const payments: { method: "cash" | "mpesa" | "credit"; amountCents: number; externalRef?: string }[] = [];
    if (method === "cash") payments.push({ method: "cash", amountCents: tendered ? toCents(tendered) : total });
    if (method === "credit") payments.push({ method: "credit", amountCents: total });
    if (method === "mpesa" && mpesaCode.trim()) payments.push({ method: "mpesa", amountCents: total, externalRef: mpesaCode.trim() });
    startWork(async () => {
      const result = await submitSale({
        customerId: customerId || undefined,
        lines: lines.map((l) => ({ productId: l.productId, ...(l.serials.length ? { serials: l.serials } : { qty: l.qty }), ...(l.category !== "otc" ? { dispensing } : {}) })),
        payments,
        discountCents: discountCents || undefined,
        discountReason: discountCents ? discountReason : undefined,
        witness: needsWitness ? witness : undefined
      });
      setOutcome(result);
      if (result.sale) reset();
    });
  }

  const canSubmit = lines.length > 0 && !working && (!needsRx || (rx.patientName.trim().length > 1 && rx.prescriberName.trim().length > 1)) && (!needsWitness || (witness.phone && witness.pin)) && (method !== "credit" || customerId);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <label className="block text-[0.8125rem] font-medium">Scan a pack or barcode</label>
          <input ref={scanRef} autoFocus value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onScan(); } }}
            placeholder="Point the scanner at the code, or type it and press Enter" className={inputClass} autoComplete="off" />
          {note ? <div className="mt-3"><Notice tone={note.tone}>{note.text}</Notice></div> : null}
          <label className="mt-4 block text-[0.8125rem] font-medium">Or search by name</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Paracetamol, amoxicillin…" className={inputClass} autoComplete="off" />
          {results.length > 0 ? (
            <ul className="mt-2 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)]">
              {results.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => { add(p); setQuery(""); setResults([]); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[0.8125rem] hover:bg-[var(--color-raised)]">
                    <span>{p.name}{p.strength ? ` ${p.strength}` : ""} <span className="text-[var(--color-faint)]">{p.packSize ?? ""}</span></span>
                    <span className="flex items-center gap-2">{p.category !== "otc" ? <Badge value={p.category} /> : null}<span className="tabular-nums">{ksh(p.listPriceCents)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {needsRx ? (
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <h3 className="text-[0.875rem] font-semibold">Dispensing record</h3>
            <p className="mt-1 text-[0.75rem] text-[var(--color-muted)]">Required for prescription and controlled items. It is kept permanently and cannot be edited.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input className={inputClass} placeholder="Patient name *" value={rx.patientName} onChange={(e) => setRx({ ...rx, patientName: e.target.value })} />
              <input className={inputClass} placeholder="Patient phone" value={rx.patientPhone} onChange={(e) => setRx({ ...rx, patientPhone: e.target.value })} />
              <input className={inputClass} placeholder="Age (years)" inputMode="numeric" value={rx.patientAgeYears} onChange={(e) => setRx({ ...rx, patientAgeYears: e.target.value })} />
              <select className={selectClass} value={rx.patientSex} onChange={(e) => setRx({ ...rx, patientSex: e.target.value })}><option value="">Sex (optional)</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select>
              <input className={inputClass} placeholder="Prescriber name *" value={rx.prescriberName} onChange={(e) => setRx({ ...rx, prescriberName: e.target.value })} />
              <input className={inputClass} placeholder="Prescriber registration no." value={rx.prescriberRegNo} onChange={(e) => setRx({ ...rx, prescriberRegNo: e.target.value })} />
              <input className={inputClass} placeholder="Prescription reference" value={rx.prescriptionRef} onChange={(e) => setRx({ ...rx, prescriptionRef: e.target.value })} />
              <input className={inputClass} placeholder="Directions" value={rx.directions} onChange={(e) => setRx({ ...rx, directions: e.target.value })} />
            </div>
            {needsWitness ? (
              <div className="mt-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3">
                <p className="text-[0.8125rem] font-medium">Controlled drug: a second person must confirm</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <input className={inputClass} placeholder="Witness phone" value={witness.phone} onChange={(e) => setWitness({ ...witness, phone: e.target.value })} />
                  <input className={inputClass} type="password" inputMode="numeric" placeholder="Witness PIN" value={witness.pin} onChange={(e) => setWitness({ ...witness, pin: e.target.value })} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-line)] px-4 py-3 text-[0.875rem] font-semibold">Sale</div>
          {lines.length === 0 ? <p className="px-4 py-6 text-center text-[0.8125rem] text-[var(--color-muted)]">Scan or search to add items.</p> : (
            <ul className="divide-y divide-[var(--color-line)]">
              {lines.map((l, i) => (
                <li key={l.productId} className="flex items-center gap-3 px-4 py-2.5 text-[0.8125rem]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{l.name} {l.category !== "otc" ? <Badge value={l.category} /> : null}</div>
                    <div className="text-[0.6875rem] text-[var(--color-faint)]">{ksh(l.unitPriceCents)} each{l.serials.length ? ` · ${l.serials.length} scanned pack(s)` : ""}</div>
                  </div>
                  <input aria-label={`Quantity of ${l.name}`} className="w-16 rounded-md border border-[var(--color-line)] px-2 py-1 text-right tabular-nums" type="number" min={1} disabled={l.serials.length > 0} value={l.qty}
                    onChange={(e) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} />
                  <span className="w-20 text-right tabular-nums">{ksh(l.qty * l.unitPriceCents)}</span>
                  <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))} className="rounded-md px-1.5 text-[var(--color-faint)] hover:bg-[var(--color-raised)]">×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-[var(--color-line)] px-4 py-3 text-[0.8125rem]">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Subtotal</span><span className="tabular-nums">{ksh(subtotal)}</span></div>
            {canDiscount ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input className={inputClass} placeholder="Discount (KES)" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                <input className={inputClass} placeholder="Reason" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
              </div>
            ) : null}
            <div className="mt-2 flex justify-between text-[1.125rem] font-semibold"><span>Total</span><span className="tabular-nums">{ksh(total)}</span></div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex gap-2">
            {(["cash", "mpesa", "credit"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)} className={`flex-1 rounded-lg border px-3 py-2 text-[0.8125rem] font-medium ${method === m ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-raised)]"}`}>
                {m === "mpesa" ? "M-Pesa" : m === "cash" ? "Cash" : "On credit"}
              </button>
            ))}
          </div>
          {method === "cash" ? <input className={inputClass} placeholder={`Cash received (default ${ksh(total)})`} inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} /> : null}
          {method === "mpesa" ? <input className={inputClass} placeholder="M-Pesa code from the customer's phone (leave blank to wait for it)" value={mpesaCode} onChange={(e) => setMpesaCode(e.target.value.toUpperCase())} /> : null}
          <Picker key={pickerKey} search={pickCustomers} placeholder={method === "credit" ? "Search for the customer by name or phone" : "Customer (optional): search by name or phone"} onPick={(o) => setCustomerId(o?.id ?? "")} />
          {outcome?.error ? <div className="mt-3"><Notice tone="danger">{outcome.error}</Notice></div> : null}
          {outcome?.sale ? (
            <div className="mt-3"><Notice tone={outcome.sale.status === "completed" ? "good" : "warn"}>
              Sale <strong>{outcome.sale.number}</strong>: {ksh(outcome.sale.totalCents)}.{" "}
              {outcome.sale.status === "completed" ? (outcome.sale.changeCents > 0 ? `Give change ${ksh(outcome.sale.changeCents)}.` : "Paid in full.") : `Waiting for ${ksh(outcome.sale.dueCents)}. For M-Pesa, ask the customer to use ${outcome.sale.number} as the account reference.`}
            </Notice></div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button type="button" className={`${buttonClass} flex-1 justify-center`} disabled={!canSubmit} onClick={complete}>{working ? "Working…" : `Complete sale · ${ksh(total)}`}</button>
            <button type="button" className={secondaryButtonClass} onClick={reset} disabled={working}>Clear</button>
          </div>
        </div>
      </div>
    </div>
  );
}
