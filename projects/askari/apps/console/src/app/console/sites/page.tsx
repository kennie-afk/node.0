import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { bq } from "@/lib/branch";
import { can } from "@/lib/roles";
import { link, pageOf, sp, type SearchParams } from "@/lib/query";
import type { Client, Page, Site } from "@/lib/types";
import { addSite } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Field, PageHeader, Paging, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

export default async function SitesPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  const [sites, clients] = await Promise.all([
    api.get<Page<Site>>(`/v1/sites?page=${pageOf(q)}&pageSize=25${q.q ? `&q=${encodeURIComponent(q.q)}` : ""}${await bq("&")}`),
    api.get<Page<Client>>("/v1/clients?pageSize=100")
  ]);
  const write = can(session.role, "sites_write");
  return (
    <>
      <PageHeader title="Sites" subtitle="Where guards stand. A map position lets Askari flag a check-in made far from the site; a QR checkpoint proves a patrol." actions={<Link href="/console/clients" className={secondaryButtonClass}>Clients</Link>} />
      <form className="mb-4 flex items-end gap-3" method="get"><Field label="Search"><input name="q" defaultValue={q.q ?? ""} className={inputClass} placeholder="Site or client" /></Field><button className={secondaryButtonClass} type="submit">Search</button></form>
      <div className={`grid gap-5 ${write ? "lg:grid-cols-[1.6fr_1fr]" : ""}`}>
        <Card>
          {sites.items.length === 0 ? <EmptyState message="No sites yet." detail="Add a client first, then a site for them." /> : (
            <Table head={["Site", "Client", "Branch", "Map", "Patrol", ""]}>
              {sites.items.map((s) => (
                <tr key={s.id} className={rowClass}>
                  <td className={cell}><Link href={`/console/sites/${s.id}`} className="font-medium hover:underline">{s.name}</Link></td>
                  <td className={cell}>{s.client}</td><td className={cell}>{s.branch}</td>
                  <td className={cell}>{s.lat !== null ? `${s.lat?.toFixed(4)}, ${s.lng?.toFixed(4)}` : <span className="text-[var(--color-warn)]">no position</span>}</td>
                  <td className={cell}>{s.checkpoints} checkpoint(s){s.roundsPerShift ? `, ${s.roundsPerShift} round(s)` : ""}</td>
                  <td className={cell}>{s.active ? null : <Badge value="ended" />}</td>
                </tr>
              ))}
            </Table>
          )}
          <Paging page={sites.page} pageSize={sites.pageSize} total={sites.total} href={(p) => link("/console/sites", q, { page: p })} />
        </Card>
        {write ? (
          <Card title="Add a site">
            {clients.items.length === 0 ? <p className="text-[0.8125rem] text-[var(--color-muted)]">Add a client first.</p> : (
              <ActionForm action={addSite} submit="Add site">
                <Field label="Client"><select name="clientId" required className={selectClass}>{clients.items.filter((c) => c.status === "active").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                <Field label="Site name"><input name="name" required className={inputClass} placeholder="Main gate" /></Field>
                <Field label="First post"><input name="postName" className={inputClass} placeholder="Main post" /></Field>
                <Field label="Address"><input name="address" className={inputClass} /></Field>
                <div className="grid grid-cols-2 gap-2"><Field label="Latitude" hint="Like -1.2921"><input name="siteLat" type="number" step="any" className={inputClass} /></Field><Field label="Longitude" hint="Like 36.8219"><input name="siteLng" type="number" step="any" className={inputClass} /></Field></div>
                <Field label="Allowed distance (m)" hint="Blank uses your default."><input name="geofenceM" type="number" min={20} className={inputClass} /></Field>
                <Field label="Patrol rounds per shift"><input name="roundsPerShift" type="number" min={0} defaultValue={0} className={inputClass} /></Field>
                <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" name="ordered" /> Checkpoints must be visited in order</label>
              </ActionForm>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
