import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { link, pageOf, sp, type SearchParams } from "@/lib/query";
import type { Client, Page } from "@/lib/types";
import { addClient } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Field, PageHeader, Paging, Table, cell, inputClass, rowClass } from "@/components/ui";

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  const clients = await api.get<Page<Client>>(`/v1/clients?page=${pageOf(q)}&pageSize=25${q.q ? `&q=${encodeURIComponent(q.q)}` : ""}`);
  return (
    <>
      <PageHeader title="Clients" subtitle="The organisations you guard for. Each can have sites, rates, invoices and a private read-only attendance link." />
      <div className={`grid gap-5 ${can(session.role, "clients_write") ? "lg:grid-cols-[1.6fr_1fr]" : ""}`}>
        <Card>
          {clients.items.length === 0 ? <EmptyState message="No clients yet." /> : (
            <Table head={["Client", "Contact", "Terms", "Sites", ""]}>{clients.items.map((c) => (
              <tr key={c.id} className={rowClass}><td className={cell}><Link href={`/console/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td><td className={cell}>{c.contactName ?? "–"}{c.contactPhone ? <div className="text-[0.6875rem] text-[var(--color-faint)]">{c.contactPhone}</div> : null}</td><td className={cell}>{c.paymentTermsDays} days</td><td className={cell}>{c.sites}</td><td className={cell}>{c.status === "active" ? null : <Badge value="ended" />}</td></tr>
            ))}</Table>
          )}
          <Paging page={clients.page} pageSize={clients.pageSize} total={clients.total} href={(p) => link("/console/clients", q, { page: p })} />
        </Card>
        {can(session.role, "clients_write") ? (
          <Card title="Add a client">
            <ActionForm action={addClient} submit="Add client">
              <Field label="Name"><input name="name" required minLength={2} className={inputClass} /></Field>
              <Field label="Contact person"><input name="contactName" className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Phone"><input name="contactPhone" className={inputClass} /></Field><Field label="Email"><input name="contactEmail" type="email" className={inputClass} /></Field></div>
              <div className="grid grid-cols-2 gap-2"><Field label="KRA PIN"><input name="kraPin" className={inputClass} /></Field><Field label="Payment terms (days)"><input name="paymentTermsDays" type="number" min={0} defaultValue={30} className={inputClass} /></Field></div>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
