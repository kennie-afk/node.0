import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { bq } from "@/lib/branch";
import { ksh } from "@/lib/format";
import type { Alerts, ClosePreview, Onboarding, Page, Product, Unmatched } from "@/lib/types";
import { Card, EmptyState, Notice, PageHeader, Stat, buttonClass, secondaryButtonClass } from "@/components/ui";

export default async function Overview() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "cashier") redirect("/console/sell");
  const q = await bq();
  const manager = session.role === "owner" || session.role === "manager";
  const [alerts, products, onboarding, today, unmatched] = await Promise.all([
    api.get<Alerts>(`/v1/stock/alerts${q}`).catch(() => null),
    api.get<Page<Product> & { total: number }>("/v1/products?limit=1").catch(() => null),
    api.get<Onboarding>("/v1/onboarding").catch(() => null),
    manager ? api.get<ClosePreview>(`/v1/close/preview${q}`).catch(() => null) : Promise.resolve(null),
    manager ? api.get<Unmatched>(`/v1/mpesa/unmatched${q}${q ? "&" : "?"}limit=1`).catch(() => null) : Promise.resolve(null)
  ]);
  const expiredValue = alerts?.expired.reduce((s, b) => s + b.valueCents, 0) ?? 0;
  const expiringValue = alerts?.expiring.reduce((s, b) => s + b.valueCents, 0) ?? 0;
  const incomplete = onboarding && onboarding.doneCount < onboarding.total;

  return (
    <>
      <PageHeader title="Overview" subtitle="What needs attention in the pharmacy right now." actions={<Link href="/console/sell" className={buttonClass}>Open the till</Link>} />
      {incomplete ? (
        <div className="mb-5"><Card title={`Getting started: ${onboarding.doneCount} of ${onboarding.total} done`} actions={<Link href="/console/get-started" className={secondaryButtonClass}>Continue</Link>}>
          <p className="text-[0.8125rem] text-[var(--color-muted)]">Next: {onboarding.items.find((i) => !i.done)?.title}. {onboarding.items.find((i) => !i.done)?.hint}</p>
        </Card></div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Expired on the shelf" value={String(alerts?.expired.length ?? 0)} hint={alerts?.expired.length ? `${ksh(expiredValue)} at cost` : "none"} tone={alerts?.expired.length ? "danger" : "good"} />
        <Stat label={`Expiring in ${alerts?.warningDays ?? 90} days`} value={String(alerts?.expiring.length ?? 0)} hint={alerts?.expiring.length ? `${ksh(expiringValue)} at cost` : "none"} tone={alerts?.expiring.length ? "warn" : "good"} />
        <Stat label="Low stock" value={String(alerts?.lowStock.length ?? 0)} hint="at or below the reorder level" tone={alerts?.lowStock.length ? "warn" : "good"} />
        {today ? <Stat label="Sold today" value={String(today.salesCount)} hint={`${ksh(today.expectedCashCents + today.mpesaCents + today.creditCents + today.pendingCents)} in total`} tone="accent" /> : <Stat label="Products" value={String(products?.total ?? 0)} tone="accent" />}
      </div>
      {unmatched && unmatched.total > 0 ? (
        <div className="mt-4"><Notice tone="warn">{unmatched.total} M-Pesa payment{unmatched.total === 1 ? " is" : "s are"} waiting to be matched to a sale. <Link href="/console/mpesa" className="font-medium underline">Match {unmatched.total === 1 ? "it" : "them"}</Link></Notice></div>
      ) : null}
      {alerts && alerts.held.length > 0 ? (
        <div className="mt-4"><Notice tone="info">{alerts.held.length} batch{alerts.held.length === 1 ? " is" : "es are"} held back (quarantined or recalled) and will not be sold. <Link href="/console/batches?status=recalled" className="font-medium underline">See batches</Link></Notice></div>
      ) : null}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Expired and expiring" description="Return to the supplier while you still can, or write off with a reason.">
          {alerts && (alerts.expired.length > 0 || alerts.expiring.length > 0) ? (
            <ul className="divide-y divide-[var(--color-line)] text-[0.8125rem]">
              {[...alerts.expired, ...alerts.expiring].slice(0, 8).map((b) => (
                <li key={b.batchId} className="flex items-center justify-between gap-3 py-2">
                  <span>{b.product} <span className="text-[var(--color-faint)]">batch {b.batchNo} · {b.qty} left</span></span>
                  <span className={b.daysToExpiry < 0 ? "font-medium text-[var(--color-danger)]" : "text-[var(--color-warn)]"}>{b.daysToExpiry < 0 ? `expired ${-b.daysToExpiry}d ago` : `${b.daysToExpiry}d left`}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState message="Nothing is expired or close to it." />}
        </Card>
        <Card title="Low stock" description="At or below the level you set for each product.">
          {alerts && alerts.lowStock.length > 0 ? (
            <ul className="divide-y divide-[var(--color-line)] text-[0.8125rem]">
              {alerts.lowStock.slice(0, 8).map((l) => (
                <li key={l.productId} className="flex items-center justify-between py-2"><span>{l.product}</span><span className="tabular-nums text-[var(--color-warn)]">{l.inDate} left (reorder at {l.reorderLevel})</span></li>
              ))}
            </ul>
          ) : <EmptyState message="Everything is above its reorder level." />}
        </Card>
      </div>
    </>
  );
}
