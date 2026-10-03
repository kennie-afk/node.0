import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { simulatePayment } from "@/app/actions";
import type { Billing, Onboarding } from "@/lib/types";
import { Badge, Card, EmptyState, KeyValue, Notice, PageHeader, Stat, Table, buttonClass, cell, num, rowClass } from "@/components/ui";
import { day, ksh, label } from "@/lib/format";

export default async function BillingPage() {
  const [b, session, onboarding] = await Promise.all([api.get<Billing>("/v1/billing"), readSession(), api.get<Onboarding>("/v1/onboarding").catch(() => null)]);
  const sample = onboarding?.isSample === true;
  const owner = session?.role === "owner";
  const unit = b.kind === "lender" ? "borrower" : "member";
  return (
    <>
      <PageHeader title="Billing" subtitle="Hazina's own subscription. Nothing you have recorded is ever deleted if an invoice goes unpaid; the account just becomes read-only." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Status" value={b.status === "past_due" ? "Overdue" : label(b.status)} tone={b.status === "suspended" ? "danger" : b.status === "past_due" ? "warn" : "good"} />
        <Stat label={b.status === "trial" ? "Trial ends" : "Paid until"} value={sample ? "Never" : day(b.coveredUntil)} hint={sample ? "a sample is never billed" : `${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"} left`} tone="accent" />
        <Stat label="Monthly price" value={ksh(b.quote.amountCents)} hint={`${b.billedUnits.toLocaleString("en-KE")} active ${unit}${b.billedUnits === 1 ? "" : "s"} · ${label(b.quote.planCode.replaceAll("-", " "))}`} tone="accent" />
        <Stat label="Owed now" value={ksh(b.outstandingCents)} tone={b.outstandingCents ? "warn" : "good"} />
      </div>
      <p className="mt-2 text-[0.75rem] text-[var(--color-muted)]">You are billed for the active {unit}s you have on the day an invoice is issued, at least one. Prices are introductory and may change.</p>
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
              {b.invoices.map((i) => <tr key={i.id} className={rowClass}><td className={`${cell} font-mono text-[0.75rem]`}>{i.number}</td><td className={`${cell} text-[var(--color-muted)]`}>{day(i.periodStart)} – {day(i.periodEnd)}</td><td className={num}>{ksh(i.amountCents)}</td><td className={cell}><Badge value={i.status} /></td></tr>)}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
