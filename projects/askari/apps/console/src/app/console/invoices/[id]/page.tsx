import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { clock, day, dayTime, ksh } from "@/lib/format";
import type { Evidence, InvoiceDetail } from "@/lib/types";
import { creditNote, invoiceEvent } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Download, EmptyState, Field, KeyValue, PageHeader, Table, cell, inputClass, rowClass, secondaryButtonClass } from "@/components/ui";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await readSession())!;
  if (!can(session.role, "reports")) redirect("/console");
  let inv: InvoiceDetail;
  try { inv = await api.get<InvoiceDetail>(`/v1/invoices/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const evidence = await api.get<Evidence[]>(`/v1/invoices/${id}/evidence`);
  const write = can(session.role, "invoices_write");
  return (
    <>
      <PageHeader title={inv.number} subtitle={`${inv.client} · ${inv.month}`} actions={<><Badge value={inv.status} />{inv.disputed ? <Badge value="disputed" /> : null}<Download href={`/files/exports/invoice/${inv.id}.csv`}>Evidence (CSV)</Download></>} />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card title="Lines"><Table head={["Description", "Quantity", "Rate", "Amount"]}>{inv.lines.map((l) => <tr key={l.id} className={rowClass}><td className={cell}>{l.description}</td><td className={`${cell} tabular-nums`}>{l.quantity} {l.basis === "per_hour" ? "hours" : "shifts"}</td><td className={`${cell} tabular-nums`}>{ksh(l.unitCents)}</td><td className={`${cell} tabular-nums`}>{ksh(l.amountCents)}</td></tr>)}</Table>
            <p className="mt-3 text-right text-[0.875rem]">Total <strong className="tabular-nums">{ksh(inv.totalCents)}</strong>{inv.creditedCents ? <> · credited {ksh(inv.creditedCents)}</> : null} · paid {ksh(inv.paidCents)} · <strong>balance {ksh(inv.balanceCents)}</strong></p>
          </Card>
          <Card title="The evidence" description="Every shift on this invoice, with when the guard was recorded present. This is what answers a dispute.">
            {evidence.length === 0 ? <EmptyState message="No shifts." /> : (
              <Table head={["Shift", "Guard", "In", "Out", "Where", "Minutes"]}>{evidence.map((e) => <tr key={e.shiftId} className={rowClass}><td className={cell}>{day(e.startAt)} {clock(e.startAt)}–{clock(e.endAt)}<div className="text-[0.6875rem] text-[var(--color-faint)]">{e.site} · {e.post}</div></td><td className={cell}>{e.guard}</td><td className={cell}>{clock(e.inAt)}{e.inOverridden ? <span title="corrected" className="ml-1 text-[var(--color-warn)]">*</span> : null}</td><td className={cell}>{clock(e.outAt)}{e.outOverridden ? <span title="corrected" className="ml-1 text-[var(--color-warn)]">*</span> : null}</td><td className={cell}>{e.geofence ? <Badge value={e.geofence} /> : "–"}</td><td className={`${cell} tabular-nums`}>{e.verifiedMinutes}</td></tr>)}</Table>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card title="Terms"><KeyValue items={[["Issued", day(inv.issueDate)], ["Due", day(inv.dueDate)], ["Shifts billed", String(inv.verifiedShifts)], ["Left off at the time", String(inv.unverifiedShifts)]]} /></Card>
          <Card title="Credit notes">{inv.creditNotes.length === 0 ? <p className="text-[0.8125rem] text-[var(--color-muted)]">None.</p> : <ul className="mb-3 text-[0.8125rem]">{inv.creditNotes.map((n) => <li key={n.id} className="border-b border-[var(--color-line)] py-1.5"><strong>{n.number}</strong> {ksh(n.amountCents)} · {n.reason}</li>)}</ul>}
            {write ? <ActionForm action={creditNote} submit="Issue credit note" button={secondaryButtonClass}><input type="hidden" name="id" value={inv.id} /><Field label="Amount (KES)"><input name="amount" type="number" min={0.01} step="0.01" required className={inputClass} /></Field><Field label="Reason"><input name="reason" required minLength={5} className={inputClass} /></Field></ActionForm> : null}
          </Card>
          <Card title="Dispute and notes">
            {inv.events.length ? <ul className="mb-3 text-[0.8125rem]">{inv.events.map((e) => <li key={e.id} className="border-b border-[var(--color-line)] py-1.5"><Badge value={e.kind === "dispute" ? "disputed" : e.kind === "resolve" ? "paid" : "info"} /> {e.body}<div className="text-[0.6875rem] text-[var(--color-faint)]">{dayTime(e.at)} · {e.by}</div></li>)}</ul> : null}
            {write ? <ActionForm action={invoiceEvent} submit={inv.disputed ? "Mark resolved" : "Record a dispute"} button={secondaryButtonClass}><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="kind" value={inv.disputed ? "resolve" : "dispute"} /><Field label={inv.disputed ? "How it was resolved" : "What the client says"}><input name="body" required minLength={3} className={inputClass} /></Field></ActionForm> : null}
          </Card>
          {inv.payments.length ? <Card title="Paid by"><ul className="text-[0.8125rem]">{inv.payments.map((p) => <li key={p.id} className="py-1">{day(p.receivedOn)} · {ksh(p.amountCents)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</li>)}</ul></Card> : null}
        </div>
      </div>
    </>
  );
}
