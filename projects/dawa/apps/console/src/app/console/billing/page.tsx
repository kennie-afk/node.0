import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { simulatePayment } from "@/app/actions";
import type { Billing } from "@/lib/types";
import { Badge, Card, EmptyState, KeyValue, Notice, PageHeader, Stat, Table, buttonClass, rowClass } from "@/components/ui";
import { day, ksh } from "@/lib/format";

export default async function BillingPage() {
  const [b, session] = await Promise.all([api.get<Billing>("/v1/billing"), readSession()]);
  const owner = session?.role === "owner";
  return (
    <>
      <PageHeader title="Billing" subtitle="Dawa's own subscription. Nothing you have recorded is ever deleted if an invoice goes unpaid; the account just becomes read-only." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Status" value={b.status === "past_due" ? "Overdue" : b.status[0]!.toUpperCase() + b.status.slice(1)} tone={b.status === "suspended" ? "danger" : b.status === "past_due" ? "warn" : "good"} />
        <Stat label={b.status === "trial" ? "Trial ends" : "Paid until"} value={day(b.coveredUntil)} hint={`${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"} left`} tone="accent" />
        <Stat label="Monthly price" value={ksh(b.quote.amountCents)} hint={`${b.billedBranches} branch${b.billedBranches === 1 ? "" : "es"}`} tone="accent" />
        <Stat label="Owed now" value={ksh(b.outstandingCents)} tone={b.outstandingCents ? "warn" : "good"} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="How to pay">
          {b.pay ? (
            <KeyValue items={[["M-Pesa paybill", b.pay.shortcode], ["Account number", b.pay.accountNumber], ["Amount", ksh(b.pay.amountCents)]]} />
          ) : (
            <p className="text-[0.8125rem] text-[var(--color-muted)]">Nothing is due yet. Your account number is <strong className="tabular-nums">{b.billingRef}</strong>; an invoice is issued a few days before the {b.status === "trial" ? "trial ends" : "period ends"}.</p>
          )}
          {b.mode === "mock" ? (
            <div className="mt-4"><Notice tone="warn">Payments are <strong>simulated</strong> on this installation: no real money moves.</Notice>
              {owner ? <form action={simulatePayment} className="mt-3"><button type="submit" className={buttonClass}>Simulate paying</button></form> : null}</div>
          ) : null}
        </Card>
        <Card title="Invoices">
          {b.invoices.length === 0 ? <EmptyState message="No invoices yet." detail="The first is issued shortly before your trial ends." /> : (
            <Table head={["Number", "Period", "Amount", "Status"]}>
              {b.invoices.map((i) => <tr key={i.id} className={rowClass}><td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{i.number}</td><td className="px-3.5 py-2.5 text-[var(--color-muted)]">{day(i.periodStart)} – {day(i.periodEnd)}</td><td className="px-3.5 py-2.5 tabular-nums">{ksh(i.amountCents)}</td><td className="px-3.5 py-2.5"><Badge value={i.status} /></td></tr>)}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
