import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { dayTime } from "@/lib/format";
import type { Incident } from "@/lib/types";
import { incidentNote } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Field, KeyValue, PageHeader, inputClass, secondaryButtonClass } from "@/components/ui";

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await readSession())!;
  let i: Incident;
  try { i = await api.get<Incident>(`/v1/incidents/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  return (
    <>
      <PageHeader title={`${i.incidentNo}: ${i.category}`} subtitle={`${i.client} · ${i.site}`} actions={<><Badge value={i.severity} /><Badge value={i.status} /></>} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Report (cannot be edited)">
          <KeyValue items={[["Occurred", dayTime(i.occurredAt)], ["Filed", dayTime(i.createdAt)], ["Reported by", i.reportedBy ?? "–"], ["Guard involved", i.guard ?? "–"]]} />
          <p className="mt-4 whitespace-pre-wrap text-[0.875rem] leading-relaxed">{i.narrative}</p>
        </Card>
        <div className="flex flex-col gap-5">
          <Card title="History">
            {i.notes?.length ? <ul className="flex flex-col gap-3 text-[0.8125rem]">{i.notes.map((n) => <li key={n.id}><div className="flex items-center gap-2"><Badge value={n.kind === "close" ? "closed" : n.kind === "reopen" ? "open" : "info"} /><span className="text-[var(--color-faint)]">{dayTime(n.at)} · {n.by}</span></div><p className="mt-1">{n.body}</p></li>)}</ul> : <p className="text-[0.8125rem] text-[var(--color-muted)]">No follow-up yet.</p>}
          </Card>
          {can(session.role, "incident_write") ? (
            <Card title="Add to it">
              <ActionForm action={incidentNote} submit="Add note" button={secondaryButtonClass}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="kind" value="note" /><Field label="Note"><input name="body" required minLength={3} className={inputClass} /></Field></ActionForm>
              {can(session.role, "incident_close") ? (
                <div className="mt-4 border-t border-[var(--color-line)] pt-4"><ActionForm action={incidentNote} submit={i.status === "open" ? "Close the incident" : "Reopen it"} button={secondaryButtonClass}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="kind" value={i.status === "open" ? "close" : "reopen"} /><Field label={i.status === "open" ? "How it was resolved" : "Why it is reopened"}><input name="body" required minLength={3} className={inputClass} /></Field></ActionForm></div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
