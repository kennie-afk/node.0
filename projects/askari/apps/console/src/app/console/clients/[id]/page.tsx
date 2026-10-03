import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { ksh, thisMonth, prevMonth } from "@/lib/format";
import type { Client, InvoiceRow, Page, Site } from "@/lib/types";
import { generateInvoice, setPortalLink, updateClient } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Field, PageHeader, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await readSession())!;
  let c: Client;
  try { c = await api.get<Client>(`/v1/clients/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const [sites, invoices] = await Promise.all([api.get<Page<Site>>(`/v1/sites?clientId=${id}&pageSize=50`), can(session.role, "reports") ? api.get<Page<InvoiceRow>>(`/v1/invoices?clientId=${id}&pageSize=20`) : Promise.resolve(null)]);
  const write = can(session.role, "clients_write");
  return (
    <>
      <PageHeader title={c.name} subtitle={`${c.paymentTermsDays}-day terms · ${c.sites} active site(s)`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Details">
          {write ? (
            <ActionForm action={updateClient} submit="Save">
              <input type="hidden" name="id" value={c.id} />
              <Field label="Name"><input name="name" defaultValue={c.name} required className={inputClass} /></Field>
              <Field label="Contact person"><input name="contactName" defaultValue={c.contactName ?? ""} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Phone"><input name="contactPhone" defaultValue={c.contactPhone ?? ""} className={inputClass} /></Field><Field label="Email"><input name="contactEmail" defaultValue={c.contactEmail ?? ""} className={inputClass} /></Field></div>
              <div className="grid grid-cols-2 gap-2"><Field label="KRA PIN"><input name="kraPin" defaultValue={c.kraPin ?? ""} className={inputClass} /></Field><Field label="Terms (days)"><input name="paymentTermsDays" type="number" defaultValue={c.paymentTermsDays} className={inputClass} /></Field></div>
              <Field label="Status"><select name="status" defaultValue={c.status} className={selectClass}><option value="active">Active</option><option value="ended">Ended</option></select></Field>
            </ActionForm>
          ) : null}
        </Card>
        <div className="flex flex-col gap-5">
          <Card title="Sites">{sites.items.length === 0 ? <EmptyState message="No sites." /> : <ul className="divide-y divide-[var(--color-line)] text-[0.8125rem]">{sites.items.map((s) => <li key={s.id} className="py-1.5"><Link href={`/console/sites/${s.id}`} className="hover:underline">{s.name}</Link></li>)}</ul>}</Card>
          {write ? (
            <Card title="Private attendance link" description="Shows this client, per site and day, how many shifts were verified, late or missed. No guard names, no pay, no rates. Anyone with the link can see it; a new link stops the old.">
              <div className="flex gap-2">
                <ActionForm action={setPortalLink} submit={c.hasPortal ? "Make a new link" : "Switch the link on"} button={secondaryButtonClass}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="enabled" value="true" /></ActionForm>
                {c.hasPortal ? <ActionForm action={setPortalLink} submit="Switch it off" button={secondaryButtonClass}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="enabled" value="false" /></ActionForm> : null}
              </div>
            </Card>
          ) : null}
          {can(session.role, "invoices_write") ? (
            <Card title="Invoice this client">
              <ActionForm action={generateInvoice} submit="Issue the invoice" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="clientId" value={c.id} />
                <Field label="Month"><input name="month" type="month" defaultValue={prevMonth()} max={thisMonth()} required className={inputClass} /></Field>
              </ActionForm>
              <p className="mt-2 text-[0.75rem] text-[var(--color-muted)]">Only shifts with a check-in and a check-out are billed, each once.</p>
            </Card>
          ) : null}
        </div>
      </div>
      {invoices ? (
        <div className="mt-5"><Card title="Recent invoices">{invoices.items.length === 0 ? <EmptyState message="None yet." /> : (
          <Table head={["Number", "Month", "Total", "Balance", "Status"]}>{invoices.items.map((i) => <tr key={i.id} className={rowClass}><td className={cell}><Link href={`/console/invoices/${i.id}`} className="hover:underline">{i.number}</Link></td><td className={cell}>{i.month}</td><td className={`${cell} tabular-nums`}>{ksh(i.totalCents)}</td><td className={`${cell} tabular-nums`}>{ksh(i.balanceCents)}</td><td className={cell}><Badge value={i.status} /></td></tr>)}</Table>
        )}</Card></div>
      ) : null}
    </>
  );
}
