import { ApiError, api, describeError } from "@/lib/api";
import { closeDay } from "@/app/actions";
import { ksh, type DailyReport, type Site } from "@/lib/types";
import { Badge, Card, Notice, PageHeader, Stat, Select, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

export default async function ReportPage({
  searchParams
}: {
  searchParams: Promise<{ site?: string; day?: string; error?: string }>;
}) {
  const params = await searchParams;

  let sites: Site[] = [];
  let report: DailyReport | null = null;
  let error: string | null = params.error ?? null;
  let notClosed = false;

  const day = params.day ?? new Date().toISOString().slice(0, 10);
  let siteId = params.site ?? "";

  try {
    sites = await api.get<Site[]>("/v1/sites");
    siteId = siteId || sites[0]?.id || "";
    if (siteId) {
      try {
        report = await api.get<DailyReport>(`/v1/report?siteId=${siteId}&day=${day}`);
      } catch (caught) {
        // a day nobody has reconciled yet is not an error: say so, and offer to run it
        if (caught instanceof ApiError && caught.status === 404) notClosed = true;
        else throw caught;
      }
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

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        {sites.length > 1 ? (
          <div className="min-w-[10rem]">
            <Select name="site" label="Site" defaultValue={siteId} options={sites.map((site) => ({ value: site.id, label: site.name }))} placeholder="Choose a site" />
          </div>
        ) : null}
        <label className="block">
          <span className="block text-[0.8125rem] font-medium">Day</span>
          <input type="date" name="day" defaultValue={day} className={`${inputClass} w-[9.5rem]`} />
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Show
        </button>
      </form>

      {siteId ? (
        <form action={closeDay} className="mb-5 flex flex-wrap items-center gap-3">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="day" value={day} />
          <button type="submit" className={buttonClass}>
            {report ? "Re-run close for this day" : "Close this day"}
          </button>
          <span className="text-[0.75rem] text-[var(--color-muted)]">
            Reconciles the day&apos;s jobs, payments and water now. It also runs by itself after midnight. Viewing a report never changes anything.
          </span>
        </form>
      ) : null}

      {notClosed ? <Notice>This day has not been reconciled yet. Press Close this day to run it.</Notice> : null}

      {report ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <Stat label="Cars detected" value={String(report.vehiclesDetected)} />
            <Stat label="Jobs recorded" value={report.jobsRecorded.toLocaleString("en-KE")} />
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
