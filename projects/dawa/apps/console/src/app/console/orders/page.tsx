import Link from "next/link";
import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { OrderForm } from "@/components/order-form";
import { Pager } from "@/components/pager";
import type { Page, PurchaseOrderRow } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Table, rowClass } from "@/components/ui";
import { day, ksh } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function Orders({ searchParams }: { searchParams: Promise<{ status?: string; offset?: string }> }) {
  const { status, offset: rawOffset } = await searchParams;
  const offset = whole(rawOffset);
  const branch = await bq();
  const page = await api.get<Page<PurchaseOrderRow>>(`/v1/purchase-orders${branch}${branch ? "&" : "?"}limit=${PAGE}&offset=${offset}${status ? `&status=${status}` : ""}`);
  const path = "/console/orders";
  return (
    <>
      <PageHeader title="Purchase orders" subtitle="What you have asked suppliers for. A delivery is booked against the order, and what you owe starts when it arrives." actions={
        <form className="flex gap-2"><select name="status" defaultValue={status ?? ""} className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]"><option value="">Any status</option><option value="open">Open</option><option value="partial">Part delivered</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select><button className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[0.8125rem] font-medium">Show</button></form>} />
      <div className="flex flex-col gap-5">
        <Card title="Raise an order">
          <OrderForm />
        </Card>
        <Card title="Orders">
          {page.items.length === 0 ? <EmptyState message="No orders yet." /> : (
            <>
              <Table head={["Order", "Supplier", "Raised", "Expected", "Units", "Value", "Status"]}>
                {page.items.map((o) => (
                  <tr key={o.id} className={rowClass}>
                    <td className="px-3.5 py-2.5"><Link href={`/console/orders/${o.id}`} className="font-medium text-[var(--color-accent)]">{o.number}</Link></td>
                    <td className="px-3.5 py-2.5">{o.supplier}</td>
                    <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{day(o.createdAt)}</td>
                    <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{o.expectedDate ? day(o.expectedDate) : "—"}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">{o.unitsReceived} of {o.unitsOrdered}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">{ksh(o.totalCents)}</td>
                    <td className="px-3.5 py-2.5"><Badge value={o.status === "partial" ? "part delivered" : o.status} /></td>
                  </tr>
                ))}
              </Table>
              <Pager from={offset} count={page.items.length} noun="orders" prev={offset > 0 ? href(path, { status, offset: Math.max(0, offset - PAGE) }) : null} next={page.hasMore ? href(path, { status, offset: offset + PAGE }) : null} />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
