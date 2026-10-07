import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { ksh } from "@/lib/format";
import { shown, waiting } from "@/lib/counts";
import type { Onboarding, Portfolio, Settings } from "@/lib/types";
import { Card, EmptyState, PageHeader, Stat, Table, buttonClass, cell, num, rowClass, secondaryButtonClass } from "@/components/ui";

export default async function Overview() {
  const session = await readSession();
  if (!session) redirect("/login");
  const role = session.role;
  const [settings, onboarding, portfolio, applied, appraised, approved, pending, unmatched] = await Promise.all([
    api.get<Settings>("/v1/settings").catch(() => null),
    api.get<Onboarding>("/v1/onboarding").catch(() => null),
    can(role, "reports") ? api.get<Portfolio>("/v1/portfolio").catch(() => null) : Promise.resolve(null),
    waiting("/v1/loans?status=applied&limit=100"),
    waiting("/v1/loans?status=appraised&limit=100"),
    waiting("/v1/loans?status=approved&limit=100"),
    can(role, "withdraw_approve") ? waiting("/v1/savings?status=pending_approval&limit=100") : Promise.resolve(null),
    can(role, "recon") ? waiting("/v1/mpesa/payments?status=unmatched&limit=100") : Promise.resolve(null)
  ]);
  const sacco = (settings?.organisation.kind ?? "sacco") === "sacco";
  const incomplete = onboarding && onboarding.doneCount < onboarding.total;
  const par30 = portfolio?.par.find((p) => p.days === 30);

  return (
    <>
      <PageHeader title="Overview" subtitle={`What needs attention in ${settings?.organisation.name ?? "your organisation"} right now.`} actions={can(role, "loan_apply") ? <Link href="/console/loans/new" className={buttonClass}>New loan application</Link> : undefined} />
      {incomplete ? (
        <div className="mb-5"><Card title={`Getting started: ${onboarding.doneCount} of ${onboarding.total} done`} actions={<Link href="/console/get-started" className={secondaryButtonClass}>Continue</Link>}>
          <p className="text-[0.8125rem] text-[var(--color-muted)]">Next: {onboarding.items.find((i) => !i.done)?.title}. {onboarding.items.find((i) => !i.done)?.hint}</p>
        </Card></div>
      ) : null}

      {portfolio ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Loans being repaid" value={String(portfolio.loansBeingRepaid)} tone="accent" />
          <Stat label="Outstanding principal" value={ksh(portfolio.outstandingPrincipalCents)} tone="accent" />
          <Stat label="At risk (over 30 days)" value={`${par30?.percent ?? 0}%`} hint={par30 ? `${ksh(par30.amountCents)} of principal` : undefined} tone={par30 && par30.percent > 5 ? "danger" : "good"} />
          <Stat label="At risk (over 1 day)" value={`${portfolio.par.find((p) => p.days === 1)?.percent ?? 0}%`} hint="any instalment late" tone="warn" />
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Work waiting" description="Each step of a loan needs a different person from the one before.">
          <ul className="divide-y divide-[var(--color-line)] text-[0.8125rem]">
            <Waiting href="/console/loans?status=applied" label="Applications to appraise" value={shown(applied)} />
            <Waiting href="/console/loans?status=appraised" label="Appraised, waiting for a decision" value={shown(appraised)} />
            <Waiting href="/console/loans?status=approved" label="Approved, waiting to be paid out" value={shown(approved)} />
            {sacco && pending ? <Waiting href="/console/savings" label="Withdrawals waiting for approval" value={shown(pending)} /> : null}
            {unmatched ? <Waiting href="/console/mpesa?status=unmatched" label="M-Pesa payments nobody has matched" value={shown(unmatched)} /> : null}
          </ul>
        </Card>
        <Card title="Arrears by age" description="Outstanding principal, by how late the oldest unpaid instalment is." actions={can(role, "reports") ? <Link href="/console/arrears" className={secondaryButtonClass}>Arrears list</Link> : undefined}>
          {portfolio && portfolio.loansBeingRepaid > 0 ? (
            <Table head={["Age (days)", "Loans", "Principal"]}>
              {portfolio.buckets.map((b) => (
                <tr key={b.bucket} className={rowClass}><td className={cell}>{b.bucket === "current" ? "Current" : b.bucket}</td><td className={num}>{b.loans}</td><td className={num}>{ksh(b.outstandingPrincipalCents)}</td></tr>
              ))}
            </Table>
          ) : <EmptyState message={portfolio ? "No loans are being repaid yet." : "Your role does not see portfolio figures."} />}
        </Card>
      </div>
    </>
  );
}

function Waiting({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <li><Link href={href} className="flex items-center justify-between py-2.5"><span>{label}</span><span className="tabular-nums font-semibold">{value}</span></Link></li>
  );
}
