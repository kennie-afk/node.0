import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { link, sp, type SearchParams } from "@/lib/query";
import type { AuditPage } from "@/lib/types";
import { Card, EmptyState, Notice, PageHeader, Pager, Table, cell, rowClass } from "@/components/ui";

const label = (action: string) => action.replace(/[._]/g, " ");

function summary(detail: Record<string, unknown>): string {
  if (typeof detail.redacted === "string") return detail.redacted;
  const parts = Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 4)
    .map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${String(value)}`);
  return parts.join(", ");
}

export default async function Audit({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  if (!can(session.role, "reports")) redirect("/console");

  const page = await api.get<AuditPage>(`/v1/audit?limit=50${q.before ? `&before=${encodeURIComponent(q.before)}` : ""}`);

  return (
    <>
      <PageHeader title="Audit trail" subtitle="Every change a person made, in the order it happened. Entries cannot be edited or removed." />
      <div className="mb-5">
        <Notice>Wage and invoice figures are shown only to people who may see wages or invoices; for everyone else the entry is listed and its figures are hidden.</Notice>
      </div>
      {page.items.length === 0 ? (
        <EmptyState message="Nothing recorded yet" detail="Changes appear here as people make them." />
      ) : (
        <Card title={`${page.items.length} most recent${q.before ? " before this point" : ""}`}>
          <Table head={["When", "Who", "What", "On", "Detail"]}>
            {page.items.map((entry) => (
              <tr key={entry.id} className={rowClass}>
                <td className={`${cell} whitespace-nowrap text-[var(--color-muted)]`}>{new Date(entry.at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}</td>
                <td className={cell}>{entry.actor ?? "System"}</td>
                <td className={`${cell} font-medium`}>{label(entry.action)}</td>
                <td className={`${cell} text-[var(--color-muted)]`}>{entry.entity}</td>
                <td className={`${cell} text-[var(--color-muted)]`}>{summary(entry.detail)}</td>
              </tr>
            ))}
          </Table>
          <Pager href={page.next ? link("/console/audit", q, { before: page.next }) : null} label="Older entries" />
        </Card>
      )}
    </>
  );
}
