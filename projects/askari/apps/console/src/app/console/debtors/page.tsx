import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { ksh, localToday, prevMonth, thisMonth } from "@/lib/format";
import { link, sp, type SearchParams } from "@/lib/query";
import type { Client, Debtors, Margin, Page, PaymentRow } from "@/lib/types";
import { recordPayment } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Card, Download, EmptyState, Field, PageHeader, Stat, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

const LABEL: Record<string, string> = { not_due: "Not due", "1-30": "1–30 days", "31-60": "31–60", "61-90": "61–90", "90+": "90+" };

export default async function DebtorsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  if (!can(session.role, "reports")) redirect("/console");
  const month = q.month || prevMonth();
  const [d, margin, payments, clients] = await Promise.all([
    api.get<Debtors>("/v1/debtors"), api.get<Margin>(`/v1/margin/${month}`), api.get<Page<PaymentRow>>("/v1/payments?pageSize=10"), api.get<Page<Client>>("/v1/clients?pageSize=100")
  ]);
  const overdue = d.totalCents - (d.totals.not_due ?? 0);
  return (
    <>
      <PageHeader title="Debtors and margin" subtitle="Who owes you, aged by days past the due date, and what each client earns you after what their guards cost." actions={<Download href="/files/exports/debtors.csv">Debtors (CSV)</Download>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Owed in all" value={ksh(d.totalCents)} tone="accent" />
        <Stat label="Overdue" value={ksh(overdue)} tone={overdue ? "danger" : "good"} />
        {d.buckets.filter((b) => b !== "not_due").slice(0, 3).map((b) => <Stat key={b} label={LABEL[b]!} value={ksh(d.totals[b] ?? 0)} tone={(d.totals[b] ?? 0) ? "warn" : "good"} />)}
      </div>
      <Card title="By client">
        {d.items.length === 0 ? <EmptyState message="Nobody owes you anything." /> : (
          <Table head={["Client", ...d.buckets.map((b) => LABEL[b]!), "Total", "Oldest"]}>{d.items.map((i) => (
            <tr key={i.clientId} className={rowClass}><td className={cell}><Link href={`/console/clients/${i.clientId}`} className="font-medium hover:underline">{i.client}</Link></td>{d.buckets.map((b) => <td key={b} className={`${cell} tabular-nums`}>{i.buckets[b] ? ksh(i.buckets[b]!) : "–"}</td>)}<td className={`${cell} font-medium tabular-nums`}>{ksh(i.totalCents)}</td><td className={cell}>{i.oldestDaysOverdue > 0 ? `${i.oldestDaysOverdue} days late` : "not due"}</td></tr>
          ))}</Table>
        )}
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card title={`Margin, ${month}`} actions={<form method="get" className="flex items-center gap-2"><input type="month" name="month" defaultValue={month} max={thisMonth()} className={inputClass} /><button className={secondaryButtonClass} type="submit">Show</button></form>} description="Invoiced, less credit notes, against the employer cost of the guards who worked there (each guard's month split by verified minutes).">
          {margin.costNote ? <p className="mb-3 text-[0.75rem] text-[var(--color-warn)]">{margin.costNote}</p> : null}
          {margin.items.length === 0 ? <EmptyState message="No invoices or cost for this month." /> : (
            <Table head={["Client", "Invoiced (net)", "Guard cost", "Margin", "%"]}>{margin.items.map((m) => <tr key={m.clientId} className={rowClass}><td className={cell}>{m.client}</td><td className={`${cell} tabular-nums`}>{ksh(m.netCents)}</td><td className={`${cell} tabular-nums`}>{margin.costKnown ? ksh(m.costCents) : "–"}</td><td className={`${cell} tabular-nums ${m.marginCents < 0 ? "text-[var(--color-danger)]" : ""}`}>{margin.costKnown ? ksh(m.marginCents) : "–"}</td><td className={cell}>{margin.costKnown && m.marginPercent !== null ? `${m.marginPercent}%` : "–"}</td></tr>)}</Table>
          )}
        </Card>
        {can(session.role, "payments_post") ? (
          <Card title="Record a payment" description="Goes to the oldest unpaid invoice first; any excess is held on account for the next one.">
            <ActionForm action={recordPayment} submit="Record payment">
              <Field label="Client"><select name="clientId" required className={selectClass}>{clients.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Amount (KES)"><input name="amount" type="number" min={0.01} step="0.01" required className={inputClass} /></Field><Field label="Received on"><input name="receivedOn" type="date" defaultValue={localToday()} required className={inputClass} /></Field></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Method"><select name="method" className={selectClass}><option value="bank">Bank</option><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></Field><Field label="Reference"><input name="reference" className={inputClass} /></Field></div>
            </ActionForm>
          </Card>
        ) : null}
      </div>
      <div className="mt-5"><Card title="Recent payments">{payments.items.length === 0 ? <EmptyState message="None." /> : <Table head={["Received", "Client", "Amount", "Method", "Reference", "On account"]}>{payments.items.map((p) => <tr key={p.id} className={rowClass}><td className={cell}>{p.receivedOn}</td><td className={cell}>{p.client}</td><td className={`${cell} tabular-nums`}>{ksh(p.amountCents)}</td><td className={cell}>{p.method}</td><td className={cell}>{p.reference ?? "–"}</td><td className={`${cell} tabular-nums`}>{p.onAccountCents ? ksh(p.onAccountCents) : "–"}</td></tr>)}</Table>}</Card></div>
      <p className="mt-3 text-[0.6875rem] text-[var(--color-faint)]">As of {localToday()}.</p>
    </>
  );
}
