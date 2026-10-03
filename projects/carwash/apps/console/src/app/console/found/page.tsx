import { api, describeError } from "@/lib/api";
import { ksh, type Summary } from "@/lib/types";
import { Card, Notice, PageHeader, Stat, Table, buttonClass, rowClass } from "@/components/ui";
import { checkRecentDays } from "@/app/actions";
import { CopyButton } from "./copy-button";

export default async function FoundPage({ searchParams }: { searchParams: Promise<{ days?: string; error?: string }> }) {
  const params = await searchParams;
  const days = Math.min(90, Math.max(1, Number.parseInt(params.days ?? "14", 10) || 14));

  let summary: Summary | null = null;
  let error: string | null = params.error ?? null;

  try {
    summary = await api.get<Summary>(`/v1/summary?days=${days}`);
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader
        title="What Forecourt found"
        subtitle="A plain summary of the days that were actually checked. Copy it, screenshot it, or send it to whoever needs to see it."
        actions={
          <form action={checkRecentDays}>
            <button type="submit" className={buttonClass}>
              Check the last 14 days
            </button>
          </form>
        }
      />

      {error ? (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      {summary?.scope === "sample" ? (
        <div className="mb-4">
          <Notice tone="warn">This is sample data, not your records.</Notice>
        </div>
      ) : null}

      {summary && summary.scope !== "none" ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <Stat label="Days checked" value={String(summary.daysChecked)} tone="accent" />
            <Stat label="Expected" value={ksh(summary.expectedCents)} hint="list price of recorded work" tone="accent" />
            <Stat label="Received" value={ksh(summary.receivedCents)} tone="accent" />
            <Stat label="Gap" value={ksh(summary.gapCents)} hint={summary.gapCents > 0 ? "unaccounted for" : "reconciled"} tone={summary.gapCents > 0 ? "danger" : "good"} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Things to look at" description="Leads to check, not proof that anyone took anything.">
              {summary.topFlags.length === 0 ? (
                <p className="text-[0.8125rem] text-[var(--color-muted)]">No flags were raised in these days.</p>
              ) : (
                <Table head={["What", "Times", "At stake"]}>
                  {summary.topFlags.map((flag) => (
                    <tr key={flag.type} className={rowClass}>
                      <td className="px-3.5 py-2.5 text-[0.8125rem]">{flag.label}</td>
                      <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{flag.count}</td>
                      <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium tabular-nums">{flag.estimatedCents > 0 ? ksh(flag.estimatedCents) : "—"}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card title="To send or screenshot" description={`${summary.from} to ${summary.to}`} actions={<CopyButton text={summary.text} />}>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--color-raised)] px-4 py-4 font-mono text-[0.8125rem] leading-relaxed">
                {summary.text}
              </pre>
            </Card>
          </div>
        </>
      ) : !error ? (
        <Card>
          <p className="text-[0.875rem] font-medium">Nothing has been reconciled yet.</p>
          <p className="mt-1 text-[0.8125rem] text-[var(--color-muted)]">
            Check the last 14 days to compare cars, work and money for each finished day, or load sample data from Start to see what
            Forecourt looks for.
          </p>
        </Card>
      ) : null}
    </>
  );
}
