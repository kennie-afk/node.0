import { evidenceLabel, evidenceValue } from "@/lib/evidence";
import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { ksh, type Discrepancy, type Page } from "@/lib/types";
import { ExportLink, FilterBar, Pager, queryString, type FilterField } from "@/components/list-tools";
import { Badge, Card, EmptyState, Notice, PageHeader, Stat } from "@/components/ui";

const EXPLAIN: Record<string, string> = {
  ghost_wash: "A car was washed and no job was ever created.",
  underquoting: "Charged below list price with no authorised discount.",
  off_book_upsell: "Extra service taken in cash and never recorded.",
  supply_pilferage: "Consumables drawn well beyond what the recorded washes needed.",
  after_hours_operation: "The site ran outside its opening hours.",
  payment_without_job: "Money arrived with nothing to attach it to.",
  job_without_payment: "Work was recorded and no money followed.",
  cash_ratio_spike: "Cash rose sharply against this site's own baseline.",
  cash_amount_mismatch: "Cash was taken for a different amount than the quote, with nobody's authorisation.",
  device_silent: "A meter sent nothing around the time cars were being washed.",
  abandoned_job_pattern: "One worker keeps opening and abandoning jobs."
};

const TABS = [
  { key: "open", label: "Open" },
  { key: "explained", label: "Explained" },
  { key: "confirmed", label: "Confirmed" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" }
];

const FILTER_KEYS = ["state", "severity", "siteId", "from", "to", "after"] as const;

export default async function FlagsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const tab = TABS.some((item) => item.key === query.state) ? (query.state as string) : "open";
  const params: Record<string, string | undefined> = { ...Object.fromEntries(FILTER_KEYS.map((key) => [key, query[key]])), state: tab };
  let flags: Discrepancy[] = [];
  let next: string | null = null;
  let error: string | null = null;

  try {
    const page = await api.get<Page<Discrepancy>>(`/v1/discrepancies${queryString(params)}`);
    flags = page.items;
    next = page.next;
  } catch (caught) {
    error = describeError(caught);
  }

  const fields: FilterField[] = [
    { name: "severity", label: "Severity", kind: "select", options: ["critical", "high", "medium", "low"].map((value) => ({ value, label: value })) },
    { name: "from", label: "Day from", kind: "date" },
    { name: "to", label: "Day to", kind: "date" }
  ];
  const filterValues = { severity: params.severity, from: params.from, to: params.to };

  const critical = flags.filter((flag) => flag.severity === "critical").length;
  const total = flags.reduce((sum, flag) => sum + flag.estimatedCents, 0);

  return (
    <>
      <PageHeader
        title="Flags"
        subtitle="Every place the three ledgers disagree, worst first. Each one carries the evidence behind it."
        actions={<ExportLink kind="flags" params={params}>Download CSV</ExportLink>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <nav className="mb-5 flex items-center gap-1">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/console/flags${queryString({ ...params, state: item.key, after: undefined })}`}
            className={`rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
              item.key === tab
                ? "bg-[var(--color-ink)] text-white"
                : "text-[var(--color-muted)] hover:bg-[var(--color-raised)] hover:text-[var(--color-ink)]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* the state lives in the tabs above, so the filter form carries it along as a hidden field */}
      <FilterBar fields={fields} values={filterValues} reset={`/console/flags?state=${tab}`} hidden={{ state: tab }} />

      {flags.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Flags shown" value={String(flags.length)} tone="warn" />
          <Stat label="Critical" value={String(critical)} tone={critical > 0 ? "danger" : "good"} />
          <Stat label="Estimated value" value={ksh(total)} hint="money the gaps represent" />
        </div>
      ) : null}

      {!error && flags.length === 0 ? (
        <Card>
          <EmptyState
            message={tab === "open" ? "Nothing is flagged" : "Nothing here"}
            detail={tab === "open" ? "Demand, work and money agree for every site and day held so far." : "No flags in this view."}
          />
        </Card>
      ) : null}

      <div className="space-y-3">
        {flags.map((flag) => (
          <Card key={flag.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge value={flag.severity} />
                  <Link href={`/console/flags/${flag.id}`} className="text-[0.8125rem] font-medium underline-offset-2 hover:underline">
                    {flag.type.replaceAll("_", " ")}
                  </Link>
                  {flag.state !== "open" ? <Badge value={flag.state} /> : null}
                  <span className="text-[0.75rem] text-[var(--color-faint)]">
                    {flag.site} · {String(flag.businessDay).slice(0, 10)}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.8125rem] text-[var(--color-muted)]">{flag.summary}</p>
                <p className="mt-1 text-[0.75rem] text-[var(--color-faint)]">
                  {flag.resolutionNote ? `“${flag.resolutionNote}”` : EXPLAIN[flag.type] ?? ""}
                </p>
              </div>
              {flag.estimatedCents > 0 ? (
                <span className="shrink-0 text-[0.9375rem] font-semibold tabular-nums text-[var(--color-danger)]">
                  {ksh(flag.estimatedCents)}
                </span>
              ) : null}
            </div>

            {Object.entries(flag.evidence ?? {}).filter(([, value]) => typeof value !== "object").length > 0 ? (
              <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-[var(--color-line)] pt-3 sm:grid-cols-3">
                {Object.entries(flag.evidence)
                  .filter(([, value]) => typeof value !== "object")
                  .slice(0, 6)
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-[0.625rem] font-medium uppercase tracking-[0.06em] text-[var(--color-faint)]">
                        {evidenceLabel(key)}
                      </dt>
                      <dd className="mt-0.5 text-[0.8125rem] tabular-nums">{evidenceValue(value)}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}
          </Card>
        ))}
      </div>

      <Pager base="/console/flags" params={params} next={next} shown={flags.length} />
    </>
  );
}
