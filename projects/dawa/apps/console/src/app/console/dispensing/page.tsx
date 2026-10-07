import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { Pager } from "@/components/pager";
import type { DispensingRow, Page } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Table, rowClass } from "@/components/ui";
import { dayTime } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function Dispensing({ searchParams }: { searchParams: Promise<{ patient?: string; from?: string; to?: string; offset?: string }> }) {
  const { patient, from, to, offset: rawOffset } = await searchParams;
  const offset = whole(rawOffset);
  const extra = [patient ? `patient=${encodeURIComponent(patient)}` : "", from ? `from=${from}` : "", to ? `to=${to}` : "", `limit=${PAGE}`, `offset=${offset}`].filter(Boolean).join("&");
  const q = await bq();
  const page = await api.get<Page<DispensingRow>>(`/v1/dispensing${q}${q ? "&" : "?"}${extra}`);
  const rows = page.items;
  const keep = { patient, from, to };
  return (
    <>
      <PageHeader title="Dispensing records" subtitle="Every prescription and controlled item dispensed: who it was for, who prescribed it, who dispensed it. These records cannot be edited." actions={
        <form className="flex gap-2"><input name="patient" defaultValue={patient} placeholder="Patient" className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /><input type="date" name="from" defaultValue={from} className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /><input type="date" name="to" defaultValue={to} className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /><button className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[0.8125rem] font-medium hover:bg-[var(--color-raised)]">Show</button></form>} />
      <Card title={offset > 0 || page.hasMore ? "Dispensing log" : `${rows.length} record${rows.length === 1 ? "" : "s"}`} description="The download holds every record in the filter, not just this page." actions={<a href="/console/dispensing/export" className="text-[0.8125rem] font-medium text-[var(--color-accent)] underline">Download CSV</a>}>
        {rows.length === 0 ? <EmptyState message="Nothing dispensed yet." /> : (
          <>
          <Table head={["When", "Item", "Patient", "Prescriber", "Dispensed by", "Batch"]}>
            {rows.map((r) => (
              <tr key={r.id} className={rowClass}>
                <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{dayTime(r.dispensedAt)}<div className="text-[0.6875rem]">{r.saleNumber}</div></td>
                <td className="px-3.5 py-2.5"><div className="font-medium">{r.product} × {r.qty}</div>{r.category === "controlled" ? <Badge value="controlled" /> : null}</td>
                <td className="px-3.5 py-2.5">{r.patientName}<div className="text-[0.6875rem] text-[var(--color-faint)]">{[r.patientAgeYears ? `${r.patientAgeYears}y` : "", r.patientSex ?? "", r.prescriptionRef ?? ""].filter(Boolean).join(" · ")}</div></td>
                <td className="px-3.5 py-2.5">{r.prescriberName}<div className="text-[0.6875rem] text-[var(--color-faint)]">{r.prescriberRegNo ?? ""}</div></td>
                <td className="px-3.5 py-2.5">{r.dispensedBy}{r.witness ? <div className="text-[0.6875rem] text-[var(--color-faint)]">witness {r.witness}</div> : null}</td>
                <td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{r.batches ?? "—"}</td>
              </tr>
            ))}
          </Table>
          <Pager from={offset} count={rows.length} noun="records" prev={offset > 0 ? href("/console/dispensing", { ...keep, offset: Math.max(0, offset - PAGE) }) : null} next={page.hasMore ? href("/console/dispensing", { ...keep, offset: offset + PAGE }) : null} />
          </>
        )}
      </Card>
    </>
  );
}
