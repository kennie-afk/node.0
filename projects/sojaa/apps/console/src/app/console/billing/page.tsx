import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { day, ksh } from "@/lib/format";
import type { Billing, SettingsView } from "@/lib/types";
import { simulatePayment } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, KeyValue, Notice, PageHeader, Table, cell, rowClass } from "@/components/ui";

export default async function BillingPage() {
  const session = (await readSession())!;
  if (!can(session.role, "billing")) redirect("/console");
  const [b, settings] = await Promise.all([api.get<Billing>("/v1/billing"), api.get<SettingsView>("/v1/settings")]);
  const sample = settings.organisation.isDemo;
  return (
    <>
      <PageHeader title="Billing" subtitle="What Sojaa charges you: a price per active guard per month, with a minimum. Prices are provisional." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Your plan" actions={<Badge value={b.status} />}>
          <KeyValue items={[["Active guards today", String(b.billedUnits)], ["This month would be", ksh(b.quote.amountCents)], ["Plan", b.quote.planCode === "minimum" ? "Minimum" : b.quote.planCode === "custom" ? "Agreed price" : `${ksh(b.quote.unitCents)} per guard`], ["Paid up to", sample ? "A sample is never billed" : day(b.coveredUntil)], ["Trial ends", sample ? "Never: a sample is never billed" : day(b.trialEndsAt)], ["Owing now", ksh(b.outstandingCents)]]} />
        </Card>
        <Card title="How to pay">
          {b.pay ? <KeyValue items={[["M-Pesa paybill", b.pay.shortcode], ["Account number", b.pay.accountNumber], ["Amount", ksh(b.pay.amountCents)]]} /> : <p className="text-[0.8125rem] text-[var(--color-muted)]">Nothing is owing. Your account number for when an invoice comes is <strong>{b.billingRef}</strong>.</p>}
          {b.mode === "mock" && settings.capabilities.billingMode === "mock" ? (
            <div className="mt-4"><Notice tone="warn">Demonstration mode: no real money moves. This button simulates a payment arriving.</Notice><div className="mt-3"><ActionForm action={simulatePayment} submit="Simulate paying the invoice"><span /></ActionForm></div></div>
          ) : null}
        </Card>
      </div>
      <div className="mt-5"><Card title="Invoices from Sojaa">
        <Table head={["Number", "Period", "Guards", "Amount", "Paid", "Status"]}>{b.invoices.map((i) => <tr key={i.id} className={rowClass}><td className={cell}>{i.number}</td><td className={cell}>{day(i.periodStart)} to {day(i.periodEnd)}</td><td className={cell}>{i.unitCount}</td><td className={`${cell} tabular-nums`}>{ksh(i.amountCents)}</td><td className={`${cell} tabular-nums`}>{ksh(i.paidCents)}</td><td className={cell}><Badge value={i.status} /></td></tr>)}</Table>
      </Card></div>
    </>
  );
}
