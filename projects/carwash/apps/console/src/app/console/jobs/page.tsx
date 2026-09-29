import { api, describeError } from "@/lib/api";
import { ksh, type Job } from "@/lib/types";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, rowClass } from "@/components/ui";

export default async function JobsPage() {
  let jobs: Job[] = [];
  let error: string | null = null;

  try {
    jobs = await api.get<Job[]>("/v1/jobs");
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="One vehicle, one visit, one worker, one payment. Every state change is timestamped by the server, never by the phone."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {!error && jobs.length === 0 ? (
        <Card>
          <EmptyState
            message="No jobs yet"
            detail="Jobs appear as workers open them on the bay."
          />
        </Card>
      ) : null}

      {jobs.length > 0 ? (
        <Card>
          <Table head={["Plate", "Worker", "State", "Quoted", "List", "Paid", "Opened"]}>
            {jobs.map((job) => {
              const undercharged = job.quotedCents < job.listCents;
              return (
                <tr key={job.id} className={rowClass}>
                  <td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{job.plate ?? "—"}</td>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] text-[var(--color-muted)]">
                    {job.worker ?? "—"}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge value={job.state} />
                  </td>
                  <td
                    className={`px-3.5 py-2.5 text-[0.8125rem] tabular-nums ${
                      undercharged ? "font-medium text-[var(--color-danger)]" : ""
                    }`}
                  >
                    {ksh(job.quotedCents)}
                  </td>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums text-[var(--color-muted)]">
                    {ksh(job.listCents)}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {job.paid ? <Badge value="paid" /> : <Badge value="unpaid" />}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap text-[0.75rem] text-[var(--color-faint)]">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      ) : null}

      <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-faint)]">
        A quoted price below list, shown in red, is the shape underquoting takes: the customer
        pays the full amount and the difference never reaches the till.
      </p>
    </>
  );
}
