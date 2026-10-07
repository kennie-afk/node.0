import Link from "next/link";
import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { readSession } from "@/lib/session";
import { adjustBatch, writeOffExpiredAction } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Pager } from "@/components/pager";
import type { Alerts, Page, StockRow } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Table, dangerButtonClass, inputClass, rowClass, secondaryButtonClass } from "@/components/ui";
import { ksh } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function Stock({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string }> }) {
  const { q, offset: rawOffset } = await searchParams;
  const offset = whole(rawOffset);
  const branch = await bq();
  const join = branch ? "&" : "?";
  const session = await readSession();
  const manager = session?.role === "owner" || session?.role === "manager";
  const [page, alerts] = await Promise.all([
    api.get<Page<StockRow>>(`/v1/stock${branch}${join}limit=${PAGE}&offset=${offset}${q ? `&search=${encodeURIComponent(q)}` : ""}`),
    api.get<Alerts>(`/v1/stock/alerts${branch}`)
  ]);
  // controlled drugs are written off one by one, each with a witness
  const controlledExpired = alerts.expired.filter((b) => b.category === "controlled");
  const expiredValue = alerts.expired.reduce((s, b) => s + b.valueCents, 0);
  const rows = page.items;
  const path = "/console/stock";
  return (
    <>
      <PageHeader title="Stock" subtitle="What is on the shelf, by product, with the next expiry. Expired stock is shown separately and is never sold." actions={<Link href="/console/batches" className={secondaryButtonClass}>Batches: hold, recall, return</Link>} />
      {alerts.held.length > 0 ? (
        <div className="mb-5"><Card title={`Held back: ${alerts.held.length} batch${alerts.held.length === 1 ? "" : "es"}`} description="Quarantined or recalled stock stays on the books but is never sold.">
          <ul className="divide-y divide-[var(--color-line)] text-[0.8125rem]">
            {alerts.held.map((b) => (
              <li key={b.batchId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{b.product} <span className="text-[var(--color-faint)]">batch {b.batchNo} · {b.qty} units</span></span><span className="flex items-center gap-2"><Badge value={b.status} /><span className="text-[var(--color-muted)]">{b.reason}</span></span></li>
            ))}
          </ul>
        </Card></div>
      ) : null}
      {alerts.expired.length > 0 ? (
        <div className="mb-5"><Card title={`Expired on the shelf: ${alerts.expired.length} batch${alerts.expired.length === 1 ? "" : "es"}, ${ksh(expiredValue)} at cost`} description="Remove it from stock so the numbers are true. A write-off needs a reason and is kept on record.">
          {manager ? (
            <ActionForm action={writeOffExpiredAction} submit="Write off all expired stock" button={dangerButtonClass} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Reason (kept on record)" hint="Controlled drugs are left out: each needs a witness, so write them off one by one below."><input name="reason" required minLength={3} defaultValue="Expired stock written off" className={inputClass} /></Field>
            </ActionForm>
          ) : <p className="text-[0.8125rem] text-[var(--color-muted)]">A manager can write all of it off in one step.</p>}
          {controlledExpired.length > 0 ? (
            <div className="mt-5 flex flex-col gap-4 border-t border-[var(--color-line)] pt-4">
              {controlledExpired.map((b) => (
                <ActionForm key={b.batchId} action={adjustBatch} submit="Write off" className="grid items-end gap-3 sm:grid-cols-[1.4fr_1.2fr_auto]">
                  <input type="hidden" name="batchId" value={b.batchId} /><input type="hidden" name="kind" value="expiry_writeoff" /><input type="hidden" name="qtyDelta" value={-b.qty} />
                  <div className="text-[0.8125rem]"><div className="font-medium">{b.product} <Badge value={b.category} /></div><div className="text-[var(--color-faint)]">batch {b.batchNo} · expired {b.expiryDate} · {b.qty} units</div></div>
                  <Field label="Reason"><input name="reason" required minLength={3} defaultValue="Expired" className={inputClass} /></Field>
                  <div className="grid grid-cols-2 gap-2 sm:col-span-3"><input name="witnessPhone" placeholder="Witness phone" className={inputClass} /><input name="witnessPin" type="password" placeholder="Witness PIN" className={inputClass} /></div>
                </ActionForm>
              ))}
            </div>
          ) : null}
        </Card></div>
      ) : null}
      <Card title={rows.length === 0 && offset === 0 ? "Products" : "Products in stock"} actions={<form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search" className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /></form>}>
        {rows.length === 0 ? <EmptyState message={q ? "Nothing matches that search." : "No products yet."} detail={q ? undefined : "Add products, then receive a delivery."} /> : (
          <>
            <Table head={["Product", "In date", "Held", "Next expiry", "Expired", "Reorder at"]}>
              {rows.map((r) => (
                <tr key={r.productId} className={rowClass}>
                  <td className="px-3.5 py-2.5"><div className="font-medium">{r.name} {r.category !== "otc" ? <Badge value={r.category} /> : null}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{[r.strength, r.form].filter(Boolean).join(" · ")}</div></td>
                  <td className={`px-3.5 py-2.5 tabular-nums ${r.reorderLevel > 0 && r.inDate <= r.reorderLevel ? "font-medium text-[var(--color-warn)]" : ""}`}>{r.inDate}</td>
                  <td className={`px-3.5 py-2.5 tabular-nums ${r.held > 0 ? "font-medium text-[var(--color-warn)]" : ""}`}>{r.held || "—"}</td>
                  <td className="px-3.5 py-2.5">{r.nextExpiry ?? "—"}</td>
                  <td className={`px-3.5 py-2.5 tabular-nums ${r.expired > 0 ? "font-medium text-[var(--color-danger)]" : ""}`}>{r.expired || "—"}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{r.reorderLevel || "—"}</td>
                </tr>
              ))}
            </Table>
            <Pager from={offset} count={rows.length} noun="products" prev={offset > 0 ? href(path, { q, offset: Math.max(0, offset - PAGE) }) : null} next={page.hasMore ? href(path, { q, offset: offset + PAGE }) : null} />
          </>
        )}
      </Card>
    </>
  );
}
