import { api, describeError } from "@/lib/api";
import { ksh, type Payment } from "@/lib/types";
import { Badge, Card, EmptyState, Notice, PageHeader, Stat, Table, rowClass } from "@/components/ui";

export default async function PaymentsPage() {
  let payments: Payment[] = [];
  let error: string | null = null;

  try {
    payments = await api.get<Payment[]>("/v1/payments");
  } catch (caught) {
    error = describeError(caught);
  }

  const unmatched = payments.filter((payment) => !payment.matched).length;
  const cash = payments.filter((payment) => payment.channel === "cash").length;
  const total = payments.reduce((sum, payment) => sum + payment.amountCents, 0);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Money lands in the owner's till and is pushed here by the Daraja callback. Matching refuses to guess when two open jobs share an amount."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {payments.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Received" value={ksh(total)} />
          <Stat
            label="Unmatched"
            value={String(unmatched)}
            hint="needs a person"
            tone={unmatched > 0 ? "warn" : "good"}
          />
          <Stat label="Cash" value={String(cash)} hint="second class, high suspicion" />
        </div>
      ) : null}

      {!error && payments.length === 0 ? (
        <Card>
          <EmptyState message="No payments yet" detail="Till callbacks appear here as they arrive." />
        </Card>
      ) : null}

      {payments.length > 0 ? (
        <Card>
          <Table head={["Reference", "Channel", "Amount", "Matched", "Received"]}>
            {payments.map((payment) => (
              <tr key={payment.id} className={rowClass}>
                <td className="px-3.5 py-2.5 font-mono text-[0.75rem]">
                  {payment.reference ?? "—"}
                </td>
                <td className="px-3.5 py-2.5">
                  <Badge value={payment.channel} />
                </td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium tabular-nums">
                  {ksh(payment.amountCents)}
                </td>
                <td className="px-3.5 py-2.5">
                  {payment.matched ? <Badge value="matched" /> : <Badge value="unmatched" />}
                </td>
                <td className="px-3.5 py-2.5 whitespace-nowrap text-[0.75rem] text-[var(--color-faint)]">
                  {new Date(payment.receivedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </>
  );
}
