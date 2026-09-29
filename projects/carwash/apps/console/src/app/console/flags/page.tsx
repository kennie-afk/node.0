import { api, describeError } from "@/lib/api";
import { ksh, type Discrepancy } from "@/lib/types";
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
  abandoned_job_pattern: "One worker keeps opening and abandoning jobs."
};

export default async function FlagsPage() {
  let flags: Discrepancy[] = [];
  let error: string | null = null;

  try {
    flags = await api.get<Discrepancy[]>("/v1/discrepancies");
  } catch (caught) {
    error = describeError(caught);
  }

  const critical = flags.filter((flag) => flag.severity === "critical").length;
  const total = flags.reduce((sum, flag) => sum + flag.estimatedCents, 0);

  return (
    <>
      <PageHeader
        title="Flags"
        subtitle="Every place the three ledgers disagree, worst first. Each one carries the evidence behind it."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {flags.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Open flags" value={String(flags.length)} tone="warn" />
          <Stat label="Critical" value={String(critical)} tone={critical > 0 ? "danger" : "good"} />
          <Stat label="Estimated value" value={ksh(total)} hint="money the gaps represent" />
        </div>
      ) : null}

      {!error && flags.length === 0 ? (
        <Card>
          <EmptyState
            message="Nothing is flagged"
            detail="Demand, work and money agree for every site and day held so far."
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
                  <span className="text-[0.8125rem] font-medium">
                    {flag.type.replaceAll("_", " ")}
                  </span>
                  <span className="text-[0.75rem] text-[var(--color-faint)]">
                    {flag.site} · {String(flag.businessDay).slice(0, 10)}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.8125rem] text-[var(--color-muted)]">{flag.summary}</p>
                <p className="mt-1 text-[0.75rem] text-[var(--color-faint)]">
                  {EXPLAIN[flag.type] ?? ""}
                </p>
              </div>
              {flag.estimatedCents > 0 ? (
                <span className="shrink-0 text-[0.9375rem] font-semibold tabular-nums text-[var(--color-danger)]">
                  {ksh(flag.estimatedCents)}
                </span>
              ) : null}
            </div>

            {Object.keys(flag.evidence ?? {}).length > 0 ? (
              <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-[var(--color-line)] pt-3 sm:grid-cols-3">
                {Object.entries(flag.evidence)
                  .filter(([, value]) => typeof value !== "object")
                  .slice(0, 6)
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-[0.625rem] font-medium uppercase tracking-[0.06em] text-[var(--color-faint)]">
                        {key.replaceAll("_", " ")}
                      </dt>
                      <dd className="mt-0.5 text-[0.8125rem] tabular-nums">{String(value)}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}
