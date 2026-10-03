import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { dayTime } from "@/lib/format";
import { link, pageOf, sp, type SearchParams } from "@/lib/query";
import type { Incident, Page, Site } from "@/lib/types";
import { reportIncident } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Download, EmptyState, Field, PageHeader, Paging, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass, textareaClass } from "@/components/ui";

export default async function IncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  const [list, sites] = await Promise.all([
    api.get<Page<Incident>>(`/v1/incidents?page=${pageOf(q)}&pageSize=25${q.status ? `&status=${q.status}` : ""}${q.severity ? `&severity=${q.severity}` : ""}`),
    can(session.role, "incident_write") ? api.get<Page<Site>>("/v1/sites?pageSize=100&active=true") : Promise.resolve(null)
  ]);
  return (
    <>
      <PageHeader title="Incidents" subtitle="A report cannot be edited once filed; follow-ups, closing and reopening are added as notes, so the history is whole." actions={<Download href="/files/exports/incidents.csv">Download</Download>} />
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <Field label="Status"><select name="status" defaultValue={q.status ?? ""} className={selectClass}><option value="">All</option><option value="open">Open</option><option value="closed">Closed</option></select></Field>
        <Field label="Severity"><select name="severity" defaultValue={q.severity ?? ""} className={selectClass}><option value="">All</option>{["critical", "major", "minor", "info"].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <button className={secondaryButtonClass} type="submit">Filter</button>
      </form>
      <div className={`grid gap-5 ${sites ? "lg:grid-cols-[1.6fr_1fr]" : ""}`}>
        <Card>
          {list.items.length === 0 ? <EmptyState message="No incidents." /> : (
            <Table head={["No.", "When", "Site", "What", "Severity", "Status"]}>{list.items.map((i) => (
              <tr key={i.id} className={rowClass}><td className={cell}><Link href={`/console/incidents/${i.id}`} className="font-medium hover:underline">{i.incidentNo}</Link></td><td className={cell}>{dayTime(i.occurredAt)}</td><td className={cell}>{i.site}<div className="text-[0.6875rem] text-[var(--color-faint)]">{i.client}</div></td><td className={cell}>{i.category}</td><td className={cell}><Badge value={i.severity} /></td><td className={cell}><Badge value={i.status} /></td></tr>
            ))}</Table>
          )}
          <Paging page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => link("/console/incidents", q, { page: p })} />
        </Card>
        {sites ? (
          <Card title="Report an incident" description="Text only. Say what happened, where and who was told.">
            <ActionForm action={reportIncident} submit="File the report">
              <Field label="Site"><select name="siteId" required className={selectClass}>{sites.items.map((s) => <option key={s.id} value={s.id}>{s.client} · {s.name}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Severity"><select name="severity" className={selectClass} defaultValue="minor"><option value="info">Info</option><option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option></select></Field><Field label="Category"><input name="category" required minLength={2} className={inputClass} placeholder="Theft, fire, access…" /></Field></div>
              <Field label="What happened"><textarea name="narrative" required minLength={5} className={textareaClass} /></Field>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
