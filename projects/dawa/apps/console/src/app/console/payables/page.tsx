import Link from "next/link";
import { api } from "@/lib/api";
import { creditNoteAction, paySupplier, voidInvoiceAction } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Pager } from "@/components/pager";
import type { Payables } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Stat, dangerButtonClass, inputClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { day, ksh } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ all?: string; offset?: string }> }) {
  const { all, offset: rawOffset } = await searchParams;
  const offset = whole(rawOffset);
  const p = await api.get<Payables>(`/v1/payables?limit=${PAGE}&offset=${offset}${all ? "" : "&open=true"}`);
  const path = "/console/payables";
  const keep = { all };
  return (
    <>
      <PageHeader title="Suppliers" subtitle="What you owe for the deliveries you have received." actions={<><Link href="/console/suppliers" className={secondaryButtonClass}>Supplier details</Link><Link href="/console/orders" className={secondaryButtonClass}>Purchase orders</Link></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><Stat label="Owed" value={ksh(p.outstandingCents)} hint="across every invoice" tone="accent" /><Stat label="Overdue" value={ksh(p.overdueCents)} tone={p.overdueCents ? "danger" : "good"} /><Stat label={all ? "Invoices shown" : "Open invoices shown"} value={String(p.items.length)} hint={p.hasMore ? "more on the next page" : undefined} tone="accent" /></div>
      <div className="mt-4 flex gap-2 text-[0.8125rem]">
        <Link href={href(path, {})} className={all ? "px-2 py-1 text-[var(--color-muted)]" : "rounded-md bg-[var(--color-raised)] px-2 py-1 font-medium"}>Owed</Link>
        <Link href={href(path, { all: 1 })} className={all ? "rounded-md bg-[var(--color-raised)] px-2 py-1 font-medium" : "px-2 py-1 text-[var(--color-muted)]"}>All invoices</Link>
      </div>
      <div className="mt-3 flex flex-col gap-4">
        {p.items.length === 0 ? <Card><EmptyState message={all ? "No invoices yet." : "You owe nothing."} /></Card> : p.items.map((i) => (
          <Card key={i.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="text-[0.9375rem] font-semibold">{i.supplier} <span className="font-normal text-[var(--color-muted)]">invoice {i.invoiceNumber}</span> {i.voided ? <Badge value="voided" /> : null}</div>
                <div className="mt-1 text-[0.8125rem] text-[var(--color-muted)]">Received {day(i.invoiceDate)}{i.dueDate ? ` · due ${day(i.dueDate)}` : ""} {i.overdue ? <Badge value="overdue" /> : null}</div>
                <div className="mt-2 text-[0.8125rem]">{i.voided ? `Voided: ${i.voidReason ?? ""}` : <>Total {ksh(i.totalCents)} · paid {ksh(i.paidCents)}{i.creditedCents ? ` · credited ${ksh(i.creditedCents)}` : ""} · <strong>owed {ksh(i.balanceCents)}</strong></>}</div></div>
              {!i.voided && i.balanceCents > 0 ? (
                <ActionForm action={paySupplier} submit="Record payment" className="grid items-end gap-2 sm:grid-cols-[7rem_7rem_9rem_auto]">
                  <input type="hidden" name="id" value={i.id} />
                  <Field label="Amount (KES)"><input name="amount" required inputMode="decimal" defaultValue={(i.balanceCents / 100).toString()} className={inputClass} /></Field>
                  <Field label="Method"><select name="method" className={selectClass} defaultValue="mpesa"><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="other">Other</option></select></Field>
                  <Field label="Reference"><input name="reference" className={inputClass} /></Field>
                </ActionForm>
              ) : null}
            </div>
            {!i.voided ? (
              <details className="mt-4 border-t border-[var(--color-line)] pt-3 text-[0.8125rem]">
                <summary className="cursor-pointer font-medium text-[var(--color-muted)]">Correct this invoice</summary>
                <div className="mt-3 grid gap-5 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[0.75rem] text-[var(--color-muted)]">A credit note from the supplier (goods sent back, a rebate, a price correction) takes money off what you owe.</p>
                    <ActionForm action={creditNoteAction} submit="Record credit note" className="grid items-end gap-2 sm:grid-cols-2">
                      <input type="hidden" name="id" value={i.id} />
                      <Field label="Amount (KES)"><input name="amount" required inputMode="decimal" className={inputClass} /></Field>
                      <Field label="Credit note no."><input name="noteNumber" className={inputClass} /></Field>
                      <div className="sm:col-span-2"><Field label="Reason"><input name="reason" required minLength={3} className={inputClass} /></Field></div>
                    </ActionForm>
                  </div>
                  <div>
                    <p className="mb-2 text-[0.75rem] text-[var(--color-muted)]">Entered wrongly? Voiding takes the invoice off what you owe and its stock back out, so the right one can be entered under the same number. It is refused once money has been paid, or some of the stock has been sold.</p>
                    <ActionForm action={voidInvoiceAction} submit="Void invoice" button={dangerButtonClass} className="flex flex-col gap-2">
                      <input type="hidden" name="id" value={i.id} />
                      <Field label="Reason (kept on record)"><input name="reason" required minLength={3} className={inputClass} /></Field>
                    </ActionForm>
                  </div>
                </div>
              </details>
            ) : null}
          </Card>
        ))}
      </div>
      <Pager from={offset} count={p.items.length} noun="invoices" prev={offset > 0 ? href(path, { ...keep, offset: Math.max(0, offset - PAGE) }) : null} next={p.hasMore ? href(path, { ...keep, offset: offset + PAGE }) : null} />
    </>
  );
}
