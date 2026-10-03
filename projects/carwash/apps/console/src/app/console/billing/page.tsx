import { api, describeError } from "@/lib/api";
import { ksh, type Billing } from "@/lib/types";
import { Badge, Card, KeyValue, Notice, PageHeader, Stat, Table, buttonClass, rowClass } from "@/components/ui";
import { simulatePayment } from "@/app/actions";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const PLAN = { starter: "Starter", growth: "Growth", custom: "Multi-site" } as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: actionError } = await searchParams;
  let billing: Billing | null = null;
  let error: string | null = null;

  try {
    billing = await api.get<Billing>("/v1/billing");
  } catch (caught) {
    error = describeError(caught);
  }

  if (error || !billing) {
    return (
      <>
        <PageHeader title="Billing" />
        <Notice tone="danger">{error}</Notice>
      </>
    );
  }

  const statusLabel = { trial: "Free trial", active: "Active", past_due: "Overdue", suspended: "Read-only", cancelled: "Cancelled" }[billing.status];
  const tone = billing.status === "active" || billing.status === "trial" ? "good" : billing.status === "past_due" ? "warn" : "danger";

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="What you pay Forecourt, and how. A flat monthly fee per site, never a share of your takings."
      />

      {actionError ? (
        <div className="mb-4">
          <Notice tone="danger">{actionError}</Notice>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Status" value={statusLabel} tone={tone} />
        <Stat label={billing.status === "trial" ? "Trial ends" : "Paid until"} value={day(billing.coveredUntil)} hint={`${billing.daysLeft} day${billing.daysLeft === 1 ? "" : "s"} left`} tone="accent" />
        <Stat label="Monthly" value={ksh(billing.quote.amountCents)} hint={`${billing.billedSites} site${billing.billedSites === 1 ? "" : "s"} × ${ksh(billing.quote.unitCents)}`} tone="accent" />
        <Stat label="To pay" value={ksh(billing.outstandingCents)} tone={billing.outstandingCents > 0 ? "warn" : "good"} hint={billing.creditCents > 0 ? `${ksh(billing.creditCents)} credit` : undefined} />
      </div>

      {billing.status === "suspended" ? (
        <div className="mb-5">
          <Notice tone="danger">
            This account is read-only. Nothing has been deleted and your tills and devices are still recording. Pay the invoice below and
            everything unlocks at once.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="How to pay" description="Pay from M-Pesa. The invoice is marked paid when the payment reaches us.">
          {billing.pay ? (
            <>
              <KeyValue
                items={[
                  ["Paybill / shortcode", billing.pay.shortcode],
                  ["Account number", billing.pay.accountNumber],
                  ["Amount", ksh(billing.pay.amountCents)]
                ]}
              />
              <p className="mt-4 text-[0.75rem] text-[var(--color-muted)]">
                Use your account number exactly; capitals and dashes do not matter. A payment with the wrong number is never lost: we
                keep it and match it by hand.
              </p>
            </>
          ) : (
            <p className="text-[0.8125rem] text-[var(--color-muted)]">
              Nothing is due yet. Your account number is <span className="font-mono">{billing.billingRef}</span>; your first invoice appears
              a few days before the trial ends.
            </p>
          )}

          {billing.mode === "mock" ? (
            <form action={simulatePayment} className="mt-5 border-t border-[var(--color-line)] pt-4">
              <p className="mb-2 text-[0.75rem] text-[var(--color-muted)]">
                Test mode: no real money moves. This sends the same confirmation M-Pesa would, through the same code.
              </p>
              <button type="submit" className={buttonClass}>
                Simulate paying {ksh(billing.outstandingCents > 0 ? billing.outstandingCents : billing.quote.amountCents)}
              </button>
            </form>
          ) : null}
        </Card>

        <Card title="Invoices">
          {billing.invoices.length === 0 ? (
            <p className="text-[0.8125rem] text-[var(--color-muted)]">No invoices yet.</p>
          ) : (
            <Table head={["Invoice", "Period", "Amount", "Status"]}>
              {billing.invoices.map((invoice) => (
                <tr key={invoice.id} className={rowClass}>
                  <td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{invoice.number}</td>
                  <td className="px-3.5 py-2.5 text-[0.75rem]">
                    {day(invoice.periodStart)} – {day(invoice.periodEnd)}
                  </td>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium tabular-nums">
                    {ksh(invoice.amountCents)} <span className="text-[var(--color-faint)]">({PLAN[invoice.planCode as keyof typeof PLAN] ?? invoice.planCode})</span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge value={invoice.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
