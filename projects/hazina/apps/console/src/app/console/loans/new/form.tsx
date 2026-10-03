"use client";

import { useActionState, useState, useTransition } from "react";
import { applyForLoan, previewLoan, type FormState } from "@/app/actions";
import { IDLE } from "@/lib/state";
import type { LoanProduct, Preview } from "@/lib/types";
import { Field, Notice, Table, buttonClass, cell, inputClass, num, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { bp, day, ksh, toCents } from "@/lib/format";

export function ApplyForm({ products, memberNo }: { products: LoanProduct[]; memberNo: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(applyForLoan, IDLE);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [principal, setPrincipal] = useState("");
  const [term, setTerm] = useState("12");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const product = products.find((p) => p.id === productId);

  function show() {
    setPreviewError(null);
    startPreview(async () => {
      const out = await previewLoan({ productId, principalCents: toCents(principal), termMonths: Number.parseInt(term, 10) });
      setPreview(out.preview);
      setPreviewError(out.error);
    });
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Member number" hint="The number on the member's card, such as M00001."><input name="memberNo" required defaultValue={memberNo} className={inputClass} /></Field>
      <Field label="Loan product">
        <select name="productId" value={productId} onChange={(e) => { setProductId(e.target.value); setPreview(null); }} className={selectClass}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {bp(p.annualRateBp)} {p.method}</option>)}
        </select>
      </Field>
      {product ? <p className="text-[0.75rem] text-[var(--color-muted)]">{ksh(product.minAmountCents)} to {ksh(product.maxAmountCents)}, {product.minTermMonths} to {product.maxTermMonths} months{product.guarantorsRequired ? `, ${product.guarantorsRequired} guarantor(s)` : ""}{product.maxMultipleOfSavings ? `, up to ${product.maxMultipleOfSavings}× savings` : ""}.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount (KSh)"><input name="principal" inputMode="decimal" required value={principal} onChange={(e) => { setPrincipal(e.target.value); setPreview(null); }} className={inputClass} /></Field>
        <Field label="Term (months)"><input name="termMonths" inputMode="numeric" required value={term} onChange={(e) => { setTerm(e.target.value); setPreview(null); }} className={inputClass} /></Field>
      </div>
      <Field label="Purpose"><input name="purpose" className={inputClass} /></Field>
      {product && product.guarantorsRequired > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-line)] p-3">
          <p className="text-[0.75rem] font-medium">Guarantors (this product needs {product.guarantorsRequired}). Each stands behind part of the loan with their own savings.</p>
          {[1, 2, 3].map((i) => <div key={i} className="grid grid-cols-2 gap-2"><input name={`guarantorNo${i}`} placeholder={`Guarantor ${i} number`} className={inputClass} /><input name={`guarantorAmount${i}`} inputMode="decimal" placeholder="Amount guaranteed" className={inputClass} /></div>)}
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={show} disabled={previewing || !principal} className={secondaryButtonClass}>{previewing ? "Working…" : "Show the schedule"}</button>
        <button type="submit" className={buttonClass} disabled={pending}>{pending ? "Submitting…" : "Submit application"}</button>
      </div>
      {previewError ? <Notice tone="danger">{previewError}</Notice> : null}
      {preview ? (
        <div>
          <p className="mb-2 text-[0.75rem] text-[var(--color-muted)]">A preview from today: the real dates are fixed when the loan is paid out. Total {ksh(preview.totals.totalCents)}: principal {ksh(preview.totals.principalCents)} and interest {ksh(preview.totals.interestCents)}.</p>
          <Table head={["#", "Due", "Principal", "Interest", "Instalment"]}>
            {preview.installments.map((r) => <tr key={r.installmentNo} className={rowClass}><td className={cell}>{r.installmentNo}</td><td className={cell}>{day(r.dueDate)}</td><td className={num}>{ksh(r.principalCents)}</td><td className={num}>{ksh(r.interestCents)}</td><td className={num}>{ksh(r.principalCents + r.interestCents)}</td></tr>)}
          </Table>
        </div>
      ) : null}
    </form>
  );
}
