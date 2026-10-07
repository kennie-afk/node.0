import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { cancelOrder } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { OrderReceive } from "@/components/order-receive";
import type { PurchaseOrder } from "@/lib/types";
import { Badge, Card, Field, KeyValue, PageHeader, Table, dangerButtonClass, inputClass, rowClass } from "@/components/ui";
import { day, ksh } from "@/lib/format";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, session] = await Promise.all([api.get<PurchaseOrder>(`/v1/purchase-orders/${id}`), readSession()]);
  const manager = session?.role === "owner" || session?.role === "manager";
  const canReceive = order.status === "open" || order.status === "partial";
  const total = order.lines.reduce((s, l) => s + l.qtyOrdered * l.unitCostCents, 0);
  return (
    <>
      <PageHeader title={`Order ${order.number}`} subtitle={`${order.supplier}${order.expectedDate ? ` · expected ${day(order.expectedDate)}` : ""}`} actions={<Badge value={order.status === "partial" ? "part delivered" : order.status} />} />
      <div className="flex flex-col gap-5">
        <Card title="What was ordered">
          <Table head={["Product", "Ordered", "Arrived", "Unit cost", "Line value"]}>
            {order.lines.map((l) => (
              <tr key={l.id} className={rowClass}>
                <td className="px-3.5 py-2.5">{l.product} {l.category !== "otc" ? <Badge value={l.category} /> : null}</td>
                <td className="px-3.5 py-2.5 tabular-nums">{l.qtyOrdered}</td>
                <td className="px-3.5 py-2.5 tabular-nums">{l.qtyReceived}</td>
                <td className="px-3.5 py-2.5 tabular-nums">{ksh(l.unitCostCents)}</td>
                <td className="px-3.5 py-2.5 tabular-nums">{ksh(l.qtyOrdered * l.unitCostCents)}</td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 text-right text-[0.8125rem] text-[var(--color-muted)]">Order value {ksh(total)}</div>
          {order.note ? <p className="mt-2 text-[0.8125rem] text-[var(--color-muted)]">{order.note}</p> : null}
          {order.cancelReason ? <p className="mt-2 text-[0.8125rem]">Cancelled: {order.cancelReason}</p> : null}
        </Card>
        {order.receipts.length > 0 ? (
          <Card title="Deliveries booked"><KeyValue items={order.receipts.map((r) => [`Invoice ${r.invoiceNumber}`, `${day(r.invoiceDate)} · ${ksh(r.totalCents)}`] as [string, string])} /></Card>
        ) : null}
        {canReceive ? <Card title="Book a delivery" description="Enter what arrived, with its batch number and expiry. Receive the rest later: the order stays open until every unit is in."><OrderReceive order={order} /></Card> : null}
        {order.status === "open" && manager ? (
          <Card title="Cancel this order" description="Possible only while nothing has been delivered.">
            <ActionForm action={cancelOrder} submit="Cancel order" button={dangerButtonClass} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
              <input type="hidden" name="id" value={order.id} />
              <Field label="Reason"><input name="reason" required minLength={3} className={inputClass} /></Field>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
