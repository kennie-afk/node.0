import Link from "next/link";
import { api } from "@/lib/api";
import type { ReturnDetail } from "@/lib/types";
import { Card, Download, Notice, PageHeader, Table, cell, num, rowClass, secondaryButtonClass } from "@/components/ui";
import { day, dayTime, ksh } from "@/lib/format";

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await api.get<ReturnDetail>(`/v1/returns/${id}`);
  const p = r.payload;
  const show = (v: number, f: "money" | "count" | "percent") => (f === "money" ? ksh(v) : f === "percent" ? `${v}%` : v.toLocaleString("en-KE"));
  return (
    <>
      <PageHeader title={p.title} subtitle={`${day(p.period.from)} to ${day(p.period.to)} · generated ${dayTime(p.generatedAt)}`} actions={<><Link href="/console/returns" className={secondaryButtonClass}>All returns</Link><Download href={`/console/download/return?id=${id}`}>CSV</Download></>} />
      <div className="mb-5"><Notice tone="warn"><strong>{p.banner}</strong></Notice></div>
      <div className="grid gap-5 lg:grid-cols-2">
        {p.sections.map((s) => (
          <Card key={s.title} title={s.title}>
            <Table head={["Line", "Value"]}>
              {s.rows.map((row) => <tr key={row.label} className={rowClass}><td className={cell}>{row.label}</td><td className={num}>{show(row.value, row.format)}</td></tr>)}
            </Table>
          </Card>
        ))}
      </div>
      <ul className="mt-5 list-disc space-y-1 pl-5 text-[0.75rem] text-[var(--color-muted)]">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </>
  );
}
