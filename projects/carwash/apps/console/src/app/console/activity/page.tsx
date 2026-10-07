import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { type ActivityEvent, type Page } from "@/lib/types";
import { FilterBar, Pager, queryString, type FilterField } from "@/components/list-tools";
import { Card, EmptyState, Notice, PageHeader, Table, rowClass } from "@/components/ui";

const TYPES = ["job.created", "job.started", "job.work_finished", "job.payment_matched", "job.closed", "job.abandoned", "job.disputed", "job.voided"];
const FILTER_KEYS = ["type", "from", "to", "after"] as const;
const FIELDS: FilterField[] = [
  { name: "type", label: "Event", kind: "select", options: TYPES.map((value) => ({ value, label: value.replace("job.", "").replaceAll("_", " ") })) },
  { name: "from", label: "From", kind: "date" },
  { name: "to", label: "To", kind: "date" }
];

function detail(event: ActivityEvent): string {
  const p = event.payload as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof p.declaredCents === "number" && typeof p.quotedCents === "number" && p.declaredCents !== p.quotedCents) {
    bits.push(`declared ${(p.declaredCents / 100).toLocaleString("en-KE")} against a quote of ${(p.quotedCents / 100).toLocaleString("en-KE")}`);
  }
  if (typeof p.reason === "string") bits.push(`“${p.reason}”`);
  if (typeof p.refundedCents === "number") bits.push(`refunded ${(p.refundedCents / 100).toLocaleString("en-KE")}`);
  return bits.join(" · ");
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const params = Object.fromEntries(FILTER_KEYS.map((key) => [key, query[key]]));
  let events: ActivityEvent[] = [];
  let next: string | null = null;
  let error: string | null = null;
  try {
    const page = await api.get<Page<ActivityEvent>>(`/v1/events${queryString(params)}`);
    events = page.items;
    next = page.next;
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader
        title="Activity"
        subtitle="The audit trail: every step of every job, stamped by the server, with who did it. Nothing here can be edited."
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <FilterBar fields={FIELDS} values={params} reset="/console/activity" />
      {!error && events.length === 0 ? (
        <Card>
          <EmptyState message="No events match" detail="Clear the filters to see everything." />
        </Card>
      ) : (
        <Card>
          <Table head={["When", "Event", "Site", "By", "Detail", "Job"]}>
            {events.map((event) => (
              <tr key={event.id} className={rowClass}>
                <td className="px-3.5 py-2 whitespace-nowrap text-[0.75rem] text-[var(--color-faint)]">{new Date(event.at).toLocaleString()}</td>
                <td className="px-3.5 py-2 text-[0.8125rem]">{event.type.replace("job.", "").replaceAll("_", " ")}</td>
                <td className="px-3.5 py-2 text-[0.8125rem] text-[var(--color-muted)]">{event.site}</td>
                <td className="px-3.5 py-2 text-[0.8125rem] text-[var(--color-muted)]">{event.actor ?? "system"}</td>
                <td className="px-3.5 py-2 text-[0.75rem] text-[var(--color-muted)]">{detail(event)}</td>
                <td className="px-3.5 py-2 text-[0.75rem]">
                  <Link href={`/console/jobs/${event.jobId}`} className="underline-offset-2 hover:underline">
                    open
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Pager base="/console/activity" params={params} next={next} shown={events.length} />
    </>
  );
}
