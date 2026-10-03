import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { bq } from "@/lib/branch";
import { can } from "@/lib/roles";
import { ksh } from "@/lib/format";
import type { Onboarding, Overview } from "@/lib/types";
import { Card, EmptyState, PageHeader, Stat, buttonClass, secondaryButtonClass } from "@/components/ui";

export default async function OverviewPage() {
  const session = (await readSession())!;
  const q = await bq();
  const [o, onboarding] = await Promise.all([api.get<Overview>(`/v1/overview${q}`), api.get<Onboarding>("/v1/onboarding").catch(() => null)]);
  const a = o.attendance;
  const incomplete = onboarding && onboarding.doneCount < onboarding.total;
  const next = onboarding?.items.find((i) => !i.done);
  return (
    <>
      <PageHeader title="Overview" subtitle="Who is on post, what needs a phone call, and what the books say." actions={<Link href="/console/attendance" className={buttonClass}>Open the board</Link>} />
      {incomplete && next ? (
        <div className="mb-5"><Card title={`Getting started: ${onboarding.doneCount} of ${onboarding.total} done`} actions={<Link href="/console/get-started" className={secondaryButtonClass}>Continue</Link>}>
          <p className="text-[0.8125rem] text-[var(--color-muted)]">Next: {next.title}. {next.hint}</p>
        </Card></div>
      ) : null}
      <h2 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-[var(--color-muted)]">Today, {o.day}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="On site now" value={String(a.on_site ?? 0)} tone="accent" hint={`${a.completed ?? 0} finished, ${a.upcoming ?? 0} to come`} />
        <Stat label="Missed" value={String((a.missed ?? 0) + (a.no_checkout ?? 0))} tone={(a.missed ?? 0) + (a.no_checkout ?? 0) ? "danger" : "good"} hint="no check-in, or never checked out" />
        <Stat label="Late" value={String(a.late ?? 0)} tone={a.late ? "warn" : "good"} hint="beyond the grace you set" />
        <Stat label="Outside the fence" value={String(a.outsideGeofence ?? 0)} tone={a.outsideGeofence ? "warn" : "good"} hint="checked in away from the site" />
        <Stat label="Open shifts" value={String((a.open ?? 0) + o.openShiftsNextWeek)} tone={(a.open ?? 0) + o.openShiftsNextWeek ? "warn" : "good"} hint="nobody assigned, now and this week" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Open incidents" actions={<Link href="/console/incidents?status=open" className={secondaryButtonClass}>See them</Link>}>
          <div className="grid grid-cols-4 gap-3">
            {(["critical", "major", "minor", "info"] as const).map((s) => <Stat key={s} label={s} value={String(o.openIncidents[s] ?? 0)} tone={s === "critical" && o.openIncidents[s] ? "danger" : s === "major" && o.openIncidents[s] ? "warn" : "good"} />)}
          </div>
          {o.pendingSwaps ? <p className="mt-3 text-[0.8125rem] text-[var(--color-muted)]"><Link className="underline" href="/console/roster?tab=swaps">{o.pendingSwaps} shift swap(s)</Link> waiting for approval.</p> : null}
        </Card>
        {can(session.role, "salary_view") && o.payroll ? (
          <Card title={`Payroll, ${o.payroll.month}`} actions={<Link href={`/console/payroll/${o.payroll.month}`} className={secondaryButtonClass}>Open</Link>}>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Guards" value={String(o.payroll.guards)} tone="accent" />
              <Stat label="Below minimum" value={String(o.payroll.belowMinimum)} tone={o.payroll.belowMinimum ? "danger" : "good"} hint={o.minimumWageCents ? `minimum ${ksh(o.minimumWageCents)} (yours to confirm)` : undefined} />
              <Stat label="Net so far" value={ksh(o.payroll.netCents)} tone="accent" />
            </div>
            {!o.payroll.tables.ready ? <p className="mt-3 text-[0.8125rem] text-[var(--color-warn)]">Deduction tables not confirmed: {o.payroll.tables.missing.join(", ")}. Nothing is deducted until they are. <Link href="/console/payroll/tables" className="underline">Fix</Link></p> : null}
            {o.payroll.unresolvedShifts ? <p className="mt-2 text-[0.8125rem] text-[var(--color-warn)]">{o.payroll.unresolvedShifts} shift(s) have a check-in but no check-out.</p> : null}
          </Card>
        ) : <Card title="Your day"><EmptyState message="Pay figures are for payroll and the owner." detail="Use the attendance board and the check-in page for the day's work." /></Card>}
        {can(session.role, "reports") && o.debtors ? (
          <Card title="Money owed to you" actions={<Link href="/console/debtors" className={secondaryButtonClass}>Debtors</Link>}>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Owed" value={ksh(o.debtors.totalCents)} tone="accent" />
              <Stat label="Overdue" value={ksh(o.debtors.overdueCents)} tone={o.debtors.overdueCents ? "danger" : "good"} />
              <Stat label="Unbilled shifts" value={String(o.unbilledShifts ?? 0)} tone={o.unbilledShifts ? "warn" : "good"} hint="verified, not yet on an invoice" />
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
