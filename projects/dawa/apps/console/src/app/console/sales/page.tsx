import Link from "next/link";
import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { Pager } from "@/components/pager";
import type { Page, SaleRow } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Table, rowClass } from "@/components/ui";
import { dayTime, ksh } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function Sales({ searchParams }: { searchParams: Promise<{ day?: string; status?: string; q?: string; offset?: string }> }) {
  const { day, status, q, offset: rawOffset } = await searchParams;
  const offset = whole(rawOffset);
  const params = [day ? `day=${day}` : "", status ? `status=${status}` : "", q ? `q=${encodeURIComponent(q)}` : "", `limit=${PAGE}`, `offset=${offset}`].filter(Boolean).join("&");
  const branch = await bq();
  const page = await api.get<Page<SaleRow>>(`/v1/sales${branch}${branch ? "&" : "?"}${params}`);
  const rows = page.items;
  const path = "/console/sales";
  const keep = { day, status, q };
  return (
    <>
      <PageHeader title="Sales" subtitle="Every sale, newest first. A sale waiting for M-Pesa stays open until the money arrives." actions={
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Sale number" className="w-32 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /><input type="date" name="day" defaultValue={day} className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /><select name="status" defaultValue={status ?? ""} className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]"><option value="">Any</option><option value="pending_payment">Waiting for payment</option><option value="completed">Completed</option><option value="voided">Voided</option></select><button className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[0.8125rem] font-medium">Show</button></form>} />
      <Card>
        {rows.length === 0 ? <EmptyState message="No sales match." /> : (
          <>
            <Table head={["Number", "When", "Cashier", "Total", "Paid", "Status"]}>
              {rows.map((s) => (
                <tr key={s.id} className={rowClass}>
                  <td className="px-3.5 py-2.5"><Link href={`/console/sales/${s.id}`} className="font-medium text-[var(--color-accent)]">{s.number}</Link></td>
                  <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{dayTime(s.createdAt)}</td>
                  <td className="px-3.5 py-2.5">{s.cashier}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{ksh(s.totalCents)}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{ksh(s.paidCents)}</td>
                  <td className="px-3.5 py-2.5"><Badge value={s.status} /></td>
                </tr>
              ))}
            </Table>
            <Pager from={offset} count={rows.length} noun="sales" prev={offset > 0 ? href(path, { ...keep, offset: Math.max(0, offset - PAGE) }) : null} next={page.hasMore ? href(path, { ...keep, offset: offset + PAGE }) : null} />
          </>
        )}
      </Card>
    </>
  );
}
