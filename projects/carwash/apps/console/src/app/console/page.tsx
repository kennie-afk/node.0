import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { ksh, type Overview } from "@/lib/types";
import { Card, Notice, PageHeader, Stat, secondaryButtonClass } from "@/components/ui";

export default async function OverviewPage() {
  let data: Overview | null = null;
  let error: string | null = null;

  try {
    data = await api.get<Overview>("/v1/overview");
  } catch (caught) {
    error = describeError(caught);
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="Overview" />
        <Notice tone="danger">{error}</Notice>
      </>
    );
  }

  const leaking = data.gapCents > 0;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`${data.organisation}. How much money should have come in against how much did, and where the gap is.`}
        actions={
          <Link href="/report" className={secondaryButtonClass}>
            Daily report
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Expected" value={ksh(data.expectedCents)} hint="list price of recorded work" />
        <Stat label="Received" value={ksh(data.receivedCents)} hint="reached the owner" />
        <Stat
          label="Gap"
          value={ksh(data.gapCents)}
          hint={leaking ? "unaccounted for" : "reconciled"}
          tone={leaking ? "danger" : "good"}
        />
        <Stat
          label="Open flags"
          value={String(data.openFlags)}
          hint={`${ksh(data.flaggedCents)} at stake`}
          tone={data.openFlags > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Work" description="What the site says it did.">
          <dl className="space-y-3">
            {[
              ["Jobs recorded", String(data.jobs)],
              ["Still open", String(data.openJobs)],
              ["Sites", String(data.sites)],
              ["Devices reporting", String(data.devices)]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <dt className="text-[0.8125rem] text-[var(--color-muted)]">{label}</dt>
                <dd className="text-[0.8125rem] font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Money" description="What reached the owner's account.">
          <dl className="space-y-3">
            {[
              ["Payments received", String(data.payments)],
              ["Not matched to a job", String(data.unmatchedPayments)]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <dt className="text-[0.8125rem] text-[var(--color-muted)]">{label}</dt>
                <dd className="text-[0.8125rem] font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-faint)]">
            Money moves straight into the owner's till and is pushed here by callback, so no
            worker handles it and no worker can suppress the record of it.
          </p>
        </Card>
      </div>

      <div className="mt-5">
        <Notice tone={leaking ? "warn" : "good"}>
          {leaking
            ? `${ksh(data.gapCents)} of recorded work has no matching payment. Open the flags to see which jobs and why.`
            : "Every recorded job has a matching payment. Nothing is outstanding today."}
        </Notice>
      </div>
    </>
  );
}
