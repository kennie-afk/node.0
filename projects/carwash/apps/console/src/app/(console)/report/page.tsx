import { api, describeError } from "@/lib/api";
import { ksh, type DailyReport, type Site } from "@/lib/types";
import { Badge, Card, Notice, PageHeader, Stat } from "@/components/ui";

export default async function ReportPage({
  searchParams
}: {
  searchParams: Promise<{ site?: string; day?: string }>;
}) {
  const params = await searchParams;

  let sites: Site[] = [];
  let report: DailyReport | null = null;
  let error: string | null = null;

  const day = params.day ?? new Date().toISOString().slice(0, 10);

  try {
    sites = await api.get<Site[]>("/v1/sites");
    const siteId = params.site ?? sites[0]?.id;
    if (siteId) {
      report = await api.get<DailyReport>(`/v1/report?siteId=${siteId}&day=${day}`);
    }
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader
        title="Daily report"
        subtitle="The dashboard is secondary. This message, sent at close of business, is what the owner actually reads and what gets renewed every month."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {report ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <Stat label="Cars detected" value={String(report.vehiclesDetected)} />
            <Stat label="Jobs recorded" value={String(report.jobsRecorded)} />
            <Stat label="Expected" value={ksh(report.expectedCents)} />
            <Stat
              label="Gap"
              value={ksh(report.gapCents)}
              tone={report.gapCents > 0 ? "danger" : "good"}
            />
          </div>

          <Card title="What the owner receives" description={`Business day ${day}.`}>
            <pre className="overflow-x-auto rounded-lg bg-[var(--color-raised)] px-4 py-4 font-mono text-[0.8125rem] leading-relaxed">
              {report.summary}
            </pre>
          </Card>

          {report.discrepancies.length > 0 ? (
            <div className="mt-5">
              <Card title="Behind the flags" description="Ordered by severity, then by money.">
                <ul className="space-y-3">
                  {report.discrepancies.map((item, index) => (
                    <li
                      key={`${item.type}-${index}`}
                      className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-line)] pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge value={item.severity} />
                          <span className="text-[0.8125rem] font-medium">
                            {item.type.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-[0.8125rem] text-[var(--color-muted)]">
                          {item.summary}
                        </p>
                      </div>
                      {item.estimatedValue > 0 ? (
                        <span className="shrink-0 text-[0.8125rem] font-semibold tabular-nums text-[var(--color-danger)]">
                          {ksh(item.estimatedValue)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
