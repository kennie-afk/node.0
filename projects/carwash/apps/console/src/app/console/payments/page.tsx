import { api, describeError } from "@/lib/api";
import { ksh, type Page, type Payment } from "@/lib/types";
import { ExportLink, FilterBar, Pager, queryString, type FilterField } from "@/components/list-tools";
import { Badge, Card, EmptyState, Notice, PageHeader, Stat, Table, rowClass } from "@/components/ui";

const FILTER_KEYS = ["channel", "matched", "reference", "from", "to", "after"] as const;
const FIELDS: FilterField[] = [
  { name: "channel", label: "Channel", kind: "select", options: ["mpesa", "cash", "card", "bank"].map((value) => ({ value, label: value })) },
  { name: "matched", label: "Matched to a job", kind: "select", options: [{ value: "yes", label: "Matched" }, { value: "no", label: "Unmatched" }] },
  { name: "reference", label: "Reference starts with", kind: "text", placeholder: "QGH" },
  { name: "from", label: "From", kind: "date" },
  { name: "to", label: "To", kind: "date" }
];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const params = Object.fromEntries(FILTER_KEYS.map((key) => [key, query[key]]));
  let payments: Payment[] = [];
  let next: string | null = null;
  let error: string | null = null;

  try {
    const page = await api.get<Page<Payment>>(`/v1/payments${queryString(params)}`);
    payments = page.items;
    next = page.next;
  } catch (caught) {
    error = describeError(caught);
  }

  const unmatched = payments.filter((payment) => !payment.matched).length;
  const cash = payments.filter((payment) => payment.channel === "cash").length;
  const total = payments.filter((payment) => !payment.reversed).reduce((sum, payment) => sum + payment.amountCents, 0);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Money lands in the owner's till and is pushed here by the Daraja callback. Matching refuses to guess when two open jobs share an amount."
        actions={<ExportLink kind="payments" params={params}>Download CSV</ExportLink>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <FilterBar fields={FIELDS} values={params} reset="/console/payments" />

      {payments.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Received" value={ksh(total)} hint="on this page" />
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
          <EmptyState message={Object.values(params).some(Boolean) ? "No payments match" : "No payments yet"} detail={Object.values(params).some(Boolean) ? "Clear the filters to see everything." : "Till callbacks appear here as they arrive."} />
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
                  {payment.reversed ? <Badge value="refunded" /> : payment.matched ? <Badge value="matched" /> : <Badge value="unmatched" />}
                </td>
                <td className="px-3.5 py-2.5 whitespace-nowrap text-[0.75rem] text-[var(--color-faint)]">
                  {new Date(payment.receivedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Pager base="/console/payments" params={params} next={next} shown={payments.length} />
    </>
  );
}
