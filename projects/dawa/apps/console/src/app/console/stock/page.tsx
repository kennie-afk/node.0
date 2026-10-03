import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { adjustBatch } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Alerts, Batch, StockRow } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Table, inputClass, rowClass } from "@/components/ui";
import { ksh } from "@/lib/format";

export default async function Stock() {
  const q = await bq();
  const [rows, alerts, batches] = await Promise.all([
    api.get<StockRow[]>(`/v1/stock${q}`),
    api.get<Alerts>(`/v1/stock/alerts${q}`),
    api.get<Batch[]>(`/v1/stock/batches${q}`)
  ]);
  const expiredBatches = batches.filter((b) => alerts.expired.some((a) => a.batchId === b.id));
  return (
    <>
      <PageHeader title="Stock" subtitle="What is on the shelf, by product, with the next expiry. Expired stock is shown separately and is never sold." />
      {alerts.expired.length > 0 ? (
        <div className="mb-5"><Card title="Expired on the shelf" description="Remove it from stock so the numbers are true. A write-off needs a reason and is kept on record. Controlled drugs also need a witness.">
          <div className="flex flex-col gap-4">
            {expiredBatches.map((b) => (
              <ActionForm key={b.id} action={adjustBatch} submit="Write off" className="grid items-end gap-3 sm:grid-cols-[1.4fr_.6fr_1.2fr_auto]">
                <input type="hidden" name="batchId" value={b.id} /><input type="hidden" name="kind" value="expiry_writeoff" /><input type="hidden" name="qtyDelta" value={-b.qtyOnHand} />
                <div className="text-[0.8125rem]"><div className="font-medium">{b.product} {b.category !== "otc" ? <Badge value={b.category} /> : null}</div><div className="text-[var(--color-faint)]">batch {b.batchNo} · expired {b.expiryDate} · {b.qtyOnHand} units · {ksh(b.qtyOnHand * b.unitCostCents)} at cost</div></div>
                <div className="text-[0.75rem] text-[var(--color-muted)]">All {b.qtyOnHand}</div>
                <Field label="Reason"><input name="reason" required minLength={3} defaultValue="Expired" className={inputClass} /></Field>
                {b.category === "controlled" ? <div className="grid grid-cols-2 gap-2 sm:col-span-4"><input name="witnessPhone" placeholder="Witness phone" className={inputClass} /><input name="witnessPin" type="password" placeholder="Witness PIN" className={inputClass} /></div> : null}
              </ActionForm>
            ))}
          </div>
        </Card></div>
      ) : null}
      <Card title={`${rows.length} products`}>
        {rows.length === 0 ? <EmptyState message="No products yet." detail="Add products, then receive a delivery." /> : (
          <Table head={["Product", "In date", "Next expiry", "Expired", "Reorder at"]}>
            {rows.map((r) => (
              <tr key={r.productId} className={rowClass}>
                <td className="px-3.5 py-2.5"><div className="font-medium">{r.name} {r.category !== "otc" ? <Badge value={r.category} /> : null}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{[r.strength, r.form].filter(Boolean).join(" · ")}</div></td>
                <td className={`px-3.5 py-2.5 tabular-nums ${r.reorderLevel > 0 && r.inDate <= r.reorderLevel ? "font-medium text-[var(--color-warn)]" : ""}`}>{r.inDate}</td>
                <td className="px-3.5 py-2.5">{r.nextExpiry ?? "—"}</td>
                <td className={`px-3.5 py-2.5 tabular-nums ${r.expired > 0 ? "font-medium text-[var(--color-danger)]" : ""}`}>{r.expired || "—"}</td>
                <td className="px-3.5 py-2.5 tabular-nums">{r.reorderLevel || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
