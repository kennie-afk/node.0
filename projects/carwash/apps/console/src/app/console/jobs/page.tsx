import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { ksh, type Job, type Page, type Site } from "@/lib/types";
import { ExportLink, FilterBar, Pager, queryString, type FilterField } from "@/components/list-tools";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, rowClass } from "@/components/ui";

const STATES = ["created", "in_progress", "awaiting_payment", "paid", "closed", "abandoned", "disputed", "voided"];
const FILTER_KEYS = ["state", "plate", "siteId", "from", "to", "after"] as const;

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const params = Object.fromEntries(FILTER_KEYS.map((key) => [key, query[key]]));
  let jobs: Job[] = [];
  let next: string | null = null;
  let sites: Site[] = [];
  let error: string | null = null;

  try {
    const [page, siteList] = await Promise.all([
      api.get<Page<Job>>(`/v1/jobs${queryString(params)}`),
      api.get<Site[]>("/v1/sites")
    ]);
    jobs = page.items;
    next = page.next;
    sites = siteList;
  } catch (caught) {
    error = describeError(caught);
  }

  const fields: FilterField[] = [
    { name: "state", label: "State", kind: "select", options: STATES.map((value) => ({ value, label: value.replaceAll("_", " ") })) },
    { name: "plate", label: "Plate starts with", kind: "text", placeholder: "KDA" },
    ...(sites.length > 1 ? [{ name: "siteId", label: "Site", kind: "select" as const, options: sites.map((site) => ({ value: site.id, label: site.name })) }] : []),
    { name: "from", label: "From", kind: "date" },
    { name: "to", label: "To", kind: "date" }
  ];

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="One vehicle, one visit, one worker, one payment. Every state change is timestamped by the server, never by the phone."
        actions={<ExportLink kind="jobs" params={params}>Download CSV</ExportLink>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <FilterBar fields={fields} values={params} reset="/console/jobs" />

      {!error && jobs.length === 0 ? (
        <Card>
          <EmptyState
            message={params.state || params.plate || params.from || params.to ? "No jobs match" : "No jobs yet"}
            detail={params.state || params.plate || params.from || params.to ? "Clear the filters to see everything." : "Jobs appear as workers open them on the bay."}
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
                  <td className="px-3.5 py-2.5 font-mono text-[0.75rem]">
                    <Link href={`/console/jobs/${job.id}`} className="underline-offset-2 hover:underline">
                      {job.plate ?? "open"}
                    </Link>
                  </td>
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

      <Pager base="/console/jobs" params={params} next={next} shown={jobs.length} />

      <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-faint)]">
        A quoted price below list, shown in red, is the shape underquoting takes: the customer
        pays the full amount and the difference never reaches the till.
      </p>
    </>
  );
}
