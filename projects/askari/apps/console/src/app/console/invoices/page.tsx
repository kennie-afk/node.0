import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { ksh, prevMonth, thisMonth } from "@/lib/format";
import { link, pageOf, sp, type SearchParams } from "@/lib/query";
import type { Client, InvoicePreview, InvoiceRow, Page } from "@/lib/types";
import { generateInvoice } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Field, Notice, PageHeader, Paging, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  if (!can(session.role, "reports")) redirect("/console");
  const [list, clients] = await Promise.all([
    api.get<Page<InvoiceRow>>(`/v1/invoices?page=${pageOf(q)}&pageSize=25${q.status ? `&status=${q.status}` : ""}${q.clientId ? `&clientId=${q.clientId}` : ""}`),
    api.get<Page<Client>>("/v1/clients?pageSize=100")
  ]);
  let preview: InvoicePreview | null = null;
  let previewError: string | null = null;
  if (q.previewClient && q.previewMonth && can(session.role, "invoices_write")) {
    try { preview = await api.send<InvoicePreview>("POST", "/v1/invoices/preview", { clientId: q.previewClient, month: q.previewMonth }); } catch (e) { previewError = e instanceof Error ? e.message : "Could not preview."; }
  }
  return (
    <>
      <PageHeader title="Invoices" subtitle="Built from verified shifts only: a check-in and a check-out, each shift billed once, at the rate in force that day." />
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <Field label="Client"><select name="clientId" defaultValue={q.clientId ?? ""} className={selectClass}><option value="">All clients</option>{clients.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Show"><select name="status" defaultValue={q.status ?? ""} className={selectClass}><option value="">All</option><option value="open">Unpaid</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="disputed">Disputed</option></select></Field>
        <button className={secondaryButtonClass} type="submit">Filter</button>
      </form>
      <div className={`grid gap-5 ${can(session.role, "invoices_write") ? "lg:grid-cols-[1.7fr_1fr]" : ""}`}>
        <Card>
          {list.items.length === 0 ? <EmptyState message="No invoices." /> : (
            <Table head={["Number", "Client", "Month", "Total", "Balance", "Due", "Status"]}>{list.items.map((i) => (
              <tr key={i.id} className={rowClass}><td className={cell}><Link href={`/console/invoices/${i.id}`} className="font-medium hover:underline">{i.number}</Link></td><td className={cell}>{i.client}</td><td className={cell}>{i.month}</td><td className={`${cell} tabular-nums`}>{ksh(i.totalCents)}</td><td className={`${cell} tabular-nums`}>{ksh(i.balanceCents)}</td><td className={cell}>{i.dueDate}</td><td className={cell}><Badge value={i.status} />{i.disputed ? <span className="ml-1"><Badge value="disputed" /></span> : null}</td></tr>
            ))}</Table>
          )}
          <Paging page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => link("/console/invoices", q, { page: p })} />
        </Card>
        {can(session.role, "invoices_write") ? (
          <div className="flex flex-col gap-5">
            <Card title="Preview, then issue" description="See what would be billed before an invoice exists.">
              <form method="get" className="flex flex-col gap-2">
                <Field label="Client"><select name="previewClient" defaultValue={q.previewClient ?? ""} required className={selectClass}><option value="">Choose…</option>{clients.items.filter((c) => c.status === "active").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                <Field label="Month"><input name="previewMonth" type="month" defaultValue={q.previewMonth ?? prevMonth()} max={thisMonth()} required className={inputClass} /></Field>
                <div><button className={secondaryButtonClass} type="submit">Preview</button></div>
              </form>
              {previewError ? <div className="mt-3"><Notice tone="danger">{previewError}</Notice></div> : null}
              {preview ? (
                <div className="mt-3 text-[0.8125rem]">
                  <p><strong>{ksh(preview.totalCents)}</strong> for {preview.billedShifts} verified shift(s). Left off: {preview.notVerified} without a check-in and check-out, {preview.noRate} without a rate.</p>
                  <ul className="mt-2 list-disc pl-4 text-[var(--color-muted)]">{preview.lines.map((l, i) => <li key={i}>{l.description}: {l.quantity} × {ksh(l.unitCents)} {l.basis === "per_hour" ? "/h" : "/shift"} = {ksh(l.amountCents)}</li>)}</ul>
                  {preview.billedShifts > 0 ? <ActionForm action={generateInvoice} submit="Issue this invoice" className="mt-3"><input type="hidden" name="clientId" value={q.previewClient} /><input type="hidden" name="month" value={q.previewMonth} /></ActionForm> : null}
                </div>
              ) : null}
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
