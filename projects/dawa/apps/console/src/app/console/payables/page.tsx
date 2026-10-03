import { api } from "@/lib/api";
import { paySupplier } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Payables } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Stat, inputClass, selectClass } from "@/components/ui";
import { day, ksh } from "@/lib/format";

export default async function PayablesPage() {
  const p = await api.get<Payables>("/v1/payables");
  const owed = p.items.filter((i) => i.balanceCents > 0);
  return (
    <>
      <PageHeader title="Suppliers" subtitle="What you owe for the deliveries you have received." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><Stat label="Owed" value={ksh(p.outstandingCents)} tone="accent" /><Stat label="Overdue" value={ksh(p.overdueCents)} tone={p.overdueCents ? "danger" : "good"} /><Stat label="Open invoices" value={String(owed.length)} tone="accent" /></div>
      <div className="mt-5 flex flex-col gap-4">
        {owed.length === 0 ? <Card><EmptyState message="You owe nothing." /></Card> : owed.map((i) => (
          <Card key={i.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="text-[0.9375rem] font-semibold">{i.supplier} <span className="font-normal text-[var(--color-muted)]">invoice {i.invoiceNumber}</span></div>
                <div className="mt-1 text-[0.8125rem] text-[var(--color-muted)]">Received {day(i.invoiceDate)}{i.dueDate ? ` · due ${day(i.dueDate)}` : ""} {i.overdue ? <Badge value="overdue" /> : null}</div>
                <div className="mt-2 text-[0.8125rem]">Total {ksh(i.totalCents)} · paid {ksh(i.paidCents)} · <strong>owed {ksh(i.balanceCents)}</strong></div></div>
              <ActionForm action={paySupplier} submit="Record payment" className="grid items-end gap-2 sm:grid-cols-[7rem_7rem_9rem_auto]">
                <input type="hidden" name="id" value={i.id} />
                <Field label="Amount (KES)"><input name="amount" required inputMode="decimal" defaultValue={(i.balanceCents / 100).toString()} className={inputClass} /></Field>
                <Field label="Method"><select name="method" className={selectClass} defaultValue="mpesa"><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="other">Other</option></select></Field>
                <Field label="Reference"><input name="reference" className={inputClass} /></Field>
              </ActionForm>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
