import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { readSession } from "@/lib/session";
import { returnToSupplierAction, setBatchStatusAction } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Pager } from "@/components/pager";
import type { Batch, Page, SupplierReturnRow } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Table, dangerButtonClass, inputClass, rowClass, selectClass } from "@/components/ui";
import { dayTime, ksh } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function Batches({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; offset?: string; roffset?: string }> }) {
  const { q, status, offset: rawOffset, roffset: rawR } = await searchParams;
  const offset = whole(rawOffset);
  const roffset = whole(rawR);
  const session = await readSession();
  const manager = session?.role === "owner" || session?.role === "manager";
  const branch = await bq();
  const join = branch ? "&" : "?";
  const [page, returns] = await Promise.all([
    api.get<Page<Batch>>(`/v1/stock/batches${branch}${join}limit=${PAGE}&offset=${offset}${q ? `&search=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}`),
    api.get<Page<SupplierReturnRow>>(`/v1/supplier-returns${branch}${join}limit=10&offset=${roffset}`).catch(() => null)
  ]);
  const path = "/console/batches";
  const keep = { q, status };
  return (
    <>
      <PageHeader title="Batches" subtitle="Every batch on the shelf. Hold one back after a recall or a doubtful delivery, or send it back to the supplier. A held batch is never sold." actions={
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Product or batch no." className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /><select name="status" defaultValue={status ?? ""} className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]"><option value="">Any status</option><option value="available">On sale</option><option value="quarantined">Quarantined</option><option value="recalled">Recalled</option></select><button className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[0.8125rem] font-medium">Show</button></form>} />
      <Card>
        {page.items.length === 0 ? <EmptyState message="No batches match." /> : (
          <>
            <Table head={["Product", "Batch", "Expiry", "On hand", "Cost", "Status", ""]}>
              {page.items.map((b) => (
                <tr key={b.id} className={`${rowClass} align-top`}>
                  <td className="px-3.5 py-2.5"><div className="font-medium">{b.product} {b.category !== "otc" ? <Badge value={b.category} /> : null}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{b.supplier ? `${b.supplier} · invoice ${b.invoiceNumber}` : ""}</div></td>
                  <td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{b.batchNo}</td>
                  <td className="px-3.5 py-2.5">{b.expiryDate}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{b.qtyOnHand}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{ksh(b.unitCostCents)}</td>
                  <td className="px-3.5 py-2.5">{b.status === "available" ? <span className="text-[var(--color-muted)]">On sale</span> : <><Badge value={b.status} /><div className="mt-1 max-w-48 text-[0.6875rem] text-[var(--color-muted)]">{b.statusReason}</div></>}</td>
                  <td className="px-3.5 py-2.5">
                    <details className="w-72 text-[0.8125rem]">
                      <summary className="cursor-pointer font-medium text-[var(--color-accent)]">Manage</summary>
                      <div className="mt-3 flex flex-col gap-4">
                        {b.status === "available" || manager ? (
                          <ActionForm action={setBatchStatusAction} submit={b.status === "available" ? "Hold back" : "Change status"} className="flex flex-col gap-2">
                            <input type="hidden" name="batchId" value={b.id} />
                            <Field label="Status"><select name="status" className={selectClass} defaultValue={b.status === "available" ? "quarantined" : "available"}>{b.status !== "quarantined" ? <option value="quarantined">Quarantine (set aside)</option> : null}{b.status !== "recalled" ? <option value="recalled">Recalled</option> : null}{manager && b.status !== "available" ? <option value="available">Put back on sale</option> : null}</select></Field>
                            <Field label="Reason (kept on record)"><input name="reason" required minLength={3} className={inputClass} placeholder="Manufacturer recall notice, cold chain broken…" /></Field>
                          </ActionForm>
                        ) : <p className="text-[0.75rem] text-[var(--color-muted)]">Only a manager can put this batch back on sale.</p>}
                        {manager && b.qtyOnHand > 0 ? (
                          <ActionForm action={returnToSupplierAction} submit="Send back" button={dangerButtonClass} className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-3">
                            <input type="hidden" name="batchId" value={b.id} />
                            {b.supplierInvoiceId ? <input type="hidden" name="invoiceId" value={b.supplierInvoiceId} /> : null}
                            <p className="text-[0.75rem] font-medium">Return to {b.supplier ?? "the supplier"}</p>
                            <div className="grid grid-cols-2 gap-2"><Field label="Units"><input name="qty" required inputMode="numeric" defaultValue={b.qtyOnHand} className={inputClass} /></Field>{b.supplierInvoiceId ? <Field label="Credit (KES)" hint={`off invoice ${b.invoiceNumber}`}><input name="credit" inputMode="decimal" className={inputClass} /></Field> : null}</div>
                            <Field label="Reason"><input name="reason" required minLength={3} className={inputClass} /></Field>
                            {b.category === "controlled" ? <div className="grid grid-cols-2 gap-2"><input name="witnessPhone" placeholder="Witness phone" className={inputClass} /><input name="witnessPin" type="password" placeholder="Witness PIN" className={inputClass} /></div> : null}
                          </ActionForm>
                        ) : null}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </Table>
            <Pager from={offset} count={page.items.length} noun="batches" prev={offset > 0 ? href(path, { ...keep, offset: Math.max(0, offset - PAGE) }) : null} next={page.hasMore ? href(path, { ...keep, offset: offset + PAGE }) : null} />
          </>
        )}
      </Card>
      {returns && (returns.items.length > 0 || roffset > 0) ? (
        <div className="mt-5"><Card title="Sent back to suppliers">
          <Table head={["When", "Supplier", "Product", "Batch", "Units", "Reason", "By"]}>
            {returns.items.map((r) => (
              <tr key={r.id} className={rowClass}><td className="px-3.5 py-2.5 text-[var(--color-muted)]">{dayTime(r.createdAt)}</td><td className="px-3.5 py-2.5">{r.supplier}</td><td className="px-3.5 py-2.5">{r.product}</td><td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{r.batchNo}</td><td className="px-3.5 py-2.5 tabular-nums">{r.qty}</td><td className="px-3.5 py-2.5">{r.reason}</td><td className="px-3.5 py-2.5">{r.by}</td></tr>
            ))}
          </Table>
          <Pager from={roffset} count={returns.items.length} noun="returns" prev={roffset > 0 ? href(path, { ...keep, offset, roffset: Math.max(0, roffset - 10) }) : null} next={returns.hasMore ? href(path, { ...keep, offset, roffset: roffset + 10 }) : null} />
        </Card></div>
      ) : null}
    </>
  );
}
