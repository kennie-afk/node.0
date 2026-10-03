import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { ksh, localToday } from "@/lib/format";
import type { Checkpoint, Rate, Site } from "@/lib/types";
import { addCheckpoint, addPost, addRate, rotateCheckpoint, toggleCheckpoint, updateSite } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Field, PageHeader, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await readSession())!;
  let site: Site;
  try { site = await api.get<Site>(`/v1/sites/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const [cps, rates] = await Promise.all([api.get<Checkpoint[]>(`/v1/sites/${id}/checkpoints`), can(session.role, "reports") ? api.get<Rate[]>(`/v1/sites/${id}/rates`) : Promise.resolve([] as Rate[])]);
  const write = can(session.role, "sites_write");
  return (
    <>
      <PageHeader title={site.name} subtitle={`${site.client} · ${site.branch}`} actions={cps.some((c) => c.token) ? <Link href={`/console/sites/${id}/qr`} className={secondaryButtonClass}>Print the QR plates</Link> : undefined} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Site">
          {write ? (
            <ActionForm action={updateSite} submit="Save">
              <input type="hidden" name="id" value={site.id} />
              <Field label="Name"><input name="name" defaultValue={site.name} required className={inputClass} /></Field>
              <Field label="Address"><input name="address" defaultValue={site.address ?? ""} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Latitude"><input name="siteLat" type="number" step="any" defaultValue={site.lat ?? ""} className={inputClass} /></Field><Field label="Longitude"><input name="siteLng" type="number" step="any" defaultValue={site.lng ?? ""} className={inputClass} /></Field></div>
              <Field label="Allowed distance (m)"><input name="geofenceM" type="number" min={20} defaultValue={site.geofenceM ?? ""} className={inputClass} /></Field>
              <Field label="Patrol rounds per shift"><input name="roundsPerShift" type="number" min={0} defaultValue={site.roundsPerShift} className={inputClass} /></Field>
              <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" name="ordered" defaultChecked={site.checkpointsOrdered} /> Visit checkpoints in order</label>
              <Field label="Status"><select name="active" defaultValue={String(site.active)} className={selectClass}><option value="true">Active</option><option value="false">Ended (no new shifts)</option></select></Field>
            </ActionForm>
          ) : <p className="text-[0.8125rem]">{site.address ?? "No address."}</p>}
        </Card>
        <Card title="Posts" description="Each post is a place a guard stands, with its own roster and (optionally) its own rate.">
          <ul className="mb-3 divide-y divide-[var(--color-line)] text-[0.8125rem]">{site.posts?.map((p) => <li key={p.id} className="flex justify-between py-1.5"><span>{p.name}</span><span className="text-[var(--color-muted)]">{p.guardsRequired} guard(s){p.active ? "" : " · inactive"}</span></li>)}</ul>
          {write ? <ActionForm action={addPost} submit="Add post" className="flex items-end gap-2"><input type="hidden" name="siteId" value={site.id} /><Field label="Name"><input name="name" required className={inputClass} placeholder="Loading bay" /></Field></ActionForm> : null}
        </Card>
        <Card title="Patrol checkpoints" description="A QR plate on the wall. The code on it is a secret: a new one stops the old at once.">
          {cps.length === 0 ? <EmptyState message="No checkpoints." /> : (
            <Table head={["#", "Checkpoint", "Code", ""]}>{cps.map((c) => (
              <tr key={c.id} className={rowClass}><td className={cell}>{c.seq}</td><td className={cell}>{c.name}{c.active ? "" : <span className="ml-1"><Badge value="ended" /></span>}</td><td className={`${cell} font-mono text-[0.6875rem]`}>{c.token ?? "hidden"}</td>
                <td className={cell}>{write ? <div className="flex gap-2"><ActionForm action={rotateCheckpoint} submit="New code" button={secondaryButtonClass}><input type="hidden" name="id" value={c.id} /></ActionForm><ActionForm action={toggleCheckpoint} submit={c.active ? "Retire" : "Restore"} button={secondaryButtonClass}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={String(!c.active)} /></ActionForm></div> : null}</td></tr>
            ))}</Table>
          )}
          {write ? <ActionForm action={addCheckpoint} submit="Add checkpoint" className="mt-3 flex items-end gap-2"><input type="hidden" name="siteId" value={site.id} /><Field label="Name"><input name="name" required className={inputClass} placeholder="Back fence" /></Field></ActionForm> : null}
        </Card>
        {can(session.role, "reports") ? (
          <Card title="What this site is billed at" description="A rate applies from its start date; earlier days keep the earlier rate. A post's own rate beats the site's.">
            {rates.length === 0 ? <p className="mb-3 text-[0.8125rem] text-[var(--color-warn)]">No rate yet: shifts here cannot be invoiced.</p> : (
              <Table head={["From", "Applies to", "Rate"]}>{rates.map((r) => <tr key={r.id} className={rowClass}><td className={cell}>{r.effectiveFrom}</td><td className={cell}>{r.post ?? "Whole site"}</td><td className={`${cell} tabular-nums`}>{ksh(r.amountCents)} {r.basis === "per_hour" ? "per hour" : "per shift"}</td></tr>)}</Table>
            )}
            {can(session.role, "invoices_write") ? (
              <ActionForm action={addRate} submit="Add rate" className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="siteId" value={site.id} />
                <Field label="Applies to"><select name="postId" className={selectClass}><option value="">Whole site</option>{site.posts?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                <div className="grid grid-cols-2 gap-2"><Field label="Basis"><select name="basis" className={selectClass}><option value="per_shift">Per shift</option><option value="per_hour">Per hour</option></select></Field><Field label="Amount (KES)"><input name="amount" type="number" min={1} step="0.01" required className={inputClass} /></Field></div>
                <Field label="From"><input name="effectiveFrom" type="date" defaultValue={localToday()} required className={inputClass} /></Field>
              </ActionForm>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}
