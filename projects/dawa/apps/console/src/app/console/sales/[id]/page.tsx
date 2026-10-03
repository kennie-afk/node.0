import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { addSalePayment, returnLine, voidSaleAction } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { SaleDetail } from "@/lib/types";
import { Badge, Card, Field, KeyValue, PageHeader, Table, dangerButtonClass, inputClass, rowClass, selectClass } from "@/components/ui";
import { dayTime, ksh } from "@/lib/format";

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sale, session] = await Promise.all([api.get<SaleDetail>(`/v1/sales/${id}`), readSession()]);
  const manager = session?.role === "owner" || session?.role === "manager";
  const canReturn = manager || session?.role === "pharmacist";
  const open = sale.status === "pending_payment";
  return (
    <>
      <PageHeader title={`Sale ${sale.number}`} subtitle={`${sale.cashier} · ${dayTime(sale.createdAt)}${sale.customer ? ` · ${sale.customer}` : ""}`} actions={<Badge value={sale.status} />} />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card title="Items">
            <Table head={["Item", "Qty", "Price", "Total", "Returned"]}>
              {sale.lines.map((l) => (
                <tr key={l.id} className={rowClass}>
                  <td className="px-3.5 py-2.5">{l.name} {l.category !== "otc" ? <Badge value={l.category} /> : null}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{l.qty}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{ksh(l.unitPriceCents)}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{ksh(l.lineTotalCents)}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{l.returnedQty || "—"}</td>
                </tr>
              ))}
            </Table>
          </Card>
          {canReturn && sale.status !== "voided" ? (
            <Card title="Return an item" description="Over-the-counter items go back on the shelf in their original batch. Prescription items are refunded but never restocked. Controlled drugs cannot be returned at the till.">
              <ActionForm action={returnLine} submit="Record the return" className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="saleId" value={sale.id} />
                <Field label="Item"><select name="lineId" className={selectClass} required>{sale.lines.filter((l) => l.category !== "controlled" && l.qty > l.returnedQty).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.qty - l.returnedQty} returnable)</option>)}</select></Field>
                <Field label="Quantity"><input name="qty" type="number" min={1} defaultValue={1} className={inputClass} /></Field>
                <Field label="Refund by"><select name="refundMethod" className={selectClass} defaultValue="cash"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="credit">Customer credit</option></select></Field>
                <Field label="Reason"><input name="reason" required minLength={3} className={inputClass} /></Field>
                <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" name="restock" defaultChecked /> Put back on the shelf</label>
              </ActionForm>
            </Card>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          <Card title="Money">
            <KeyValue items={[["Subtotal", ksh(sale.subtotalCents)], ["Discount", ksh(sale.discountCents)], ["Total", ksh(sale.totalCents)], ["Paid", ksh(sale.paidCents)], ["Still due", ksh(sale.dueCents)]]} />
            {sale.payments.length > 0 ? <ul className="mt-4 divide-y divide-[var(--color-line)] text-[0.8125rem]">{sale.payments.map((p, i) => <li key={i} className="flex justify-between py-1.5"><span className="capitalize">{p.method}{p.externalRef ? ` · ${p.externalRef}` : ""}</span><span className="tabular-nums">{ksh(p.amountCents)}</span></li>)}</ul> : null}
          </Card>
          {open ? (
            <Card title="Record a payment" description="For M-Pesa, type the code from the customer's phone, or wait: the payment matches this sale by itself when the number is used as the account reference.">
              <ActionForm action={addSalePayment} submit="Record payment">
                <input type="hidden" name="saleId" value={sale.id} />
                <Field label="Method"><select name="method" className={selectClass} defaultValue="cash"><option value="cash">Cash</option><option value="mpesa">M-Pesa code</option></select></Field>
                <Field label="Amount (KES)"><input name="amount" inputMode="decimal" defaultValue={(sale.dueCents / 100).toString()} className={inputClass} /></Field>
                <Field label="M-Pesa code (if M-Pesa)"><input name="ref" className={inputClass} /></Field>
              </ActionForm>
            </Card>
          ) : null}
          {manager && sale.status !== "voided" ? (
            <Card title="Void this sale" description="Only for a sale from today with no dispensed prescription items. The stock goes back on the shelf.">
              <ActionForm action={voidSaleAction} submit="Void sale" button={dangerButtonClass}><input type="hidden" name="saleId" value={sale.id} /><Field label="Reason"><input name="reason" required minLength={3} className={inputClass} /></Field></ActionForm>
            </Card>
          ) : null}
          {sale.voidReason ? <Card title="Voided"><p className="text-[0.8125rem]">{sale.voidReason}</p></Card> : null}
        </div>
      </div>
    </>
  );
}
