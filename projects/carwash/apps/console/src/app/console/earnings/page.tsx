import { api, describeError } from "@/lib/api";
import { ksh, type CommissionReport } from "@/lib/types";
import { FilterBar, queryString, type FilterField } from "@/components/list-tools";
import { Card, EmptyState, Notice, PageHeader, Stat, Table, rowClass, secondaryButtonClass } from "@/components/ui";

const FIELDS: FilterField[] = [
  { name: "from", label: "From", kind: "date" },
  { name: "to", label: "To", kind: "date" }
];

export default async function EarningsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const params = { from: query.from, to: query.to };
  let report: CommissionReport | null = null;
  let error: string | null = null;
  try {
    report = await api.get<CommissionReport>(`/v1/reports/commissions${queryString(params)}`);
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader
        title="Earnings"
        subtitle="What each attendant earned: their commission rate on the services of paid jobs. A refunded sale earns nothing, and a job nobody paid for earns nothing."
        actions={
          <a href={`/console/earnings/csv${queryString(params)}`} className={secondaryButtonClass}>
            Download CSV
          </a>
        }
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <FilterBar fields={FIELDS} values={params} reset="/console/earnings" />

      {report && report.rows.length > 0 ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Paid jobs" value={String(report.totals.jobs)} />
            <Stat label="Sales" value={ksh(report.totals.grossCents)} />
            <Stat label="Commission" value={ksh(report.totals.commissionCents)} tone="accent" />
          </div>
          <Card>
            <Table head={["Attendant", "Paid jobs", "Sales", "Commission"]}>
              {report.rows.map((row) => (
                <tr key={row.workerId} className={rowClass}>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium">{row.worker}</td>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{row.jobs}</td>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{ksh(row.grossCents)}</td>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium tabular-nums">{ksh(row.commissionCents)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : null}
      {report && report.rows.length === 0 ? (
        <Card>
          <EmptyState message="No paid work in this period" detail="Choose a wider range, or wait for jobs to be paid." />
        </Card>
      ) : null}
    </>
  );
}
