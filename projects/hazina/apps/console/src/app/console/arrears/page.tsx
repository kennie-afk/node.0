import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { runPenalties } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { ArrearsPage, Portfolio } from "@/lib/types";
import { Badge, Card, Download, EmptyState, PageHeader, Pager, Stat, Table, cell, num, rowClass, secondaryButtonClass } from "@/components/ui";
import { day, ksh } from "@/lib/format";

const PAGE = 50;

export default async function Arrears({ searchParams }: { searchParams: Promise<{ offset?: string; minDays?: string }> }) {
  const { offset: o, minDays: m } = await searchParams;
  const role = (await readSession())?.role ?? "";
  const offset = Math.max(0, Number.parseInt(o ?? "0", 10) || 0);
  const minDays = Math.max(1, Number.parseInt(m ?? "1", 10) || 1);
  const [portfolio, arrears] = await Promise.all([
    api.get<Portfolio>("/v1/portfolio"),
    api.get<ArrearsPage>(`/v1/arrears?minDays=${minDays}&limit=${PAGE}&offset=${offset}`)
  ]);
  const nextOffset = offset + PAGE < arrears.total ? offset + PAGE : null;

  return (
    <>
      <PageHeader title="Arrears and portfolio at risk" subtitle={`As at ${day(portfolio.asOf)}. These figures are always as at today: repayment schedules keep no history, so a past date would give a wrong answer.`} actions={<><Download href="/console/download/arrears">Download CSV</Download>{can(role, "penalties_run") ? <ActionForm action={runPenalties} submit="Charge penalties now" button={secondaryButtonClass} className="flex"><span /></ActionForm> : null}</>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Loans being repaid" value={String(portfolio.loansBeingRepaid)} tone="accent" />
        <Stat label="Outstanding principal" value={ksh(portfolio.outstandingPrincipalCents)} tone="accent" />
        {portfolio.par.filter((p) => p.days !== 60).map((p) => <Stat key={p.days} label={`PAR over ${p.days} day${p.days === 1 ? "" : "s"}`} value={`${p.percent}%`} hint={ksh(p.amountCents)} tone={p.days >= 30 && p.percent > 5 ? "danger" : p.percent > 0 ? "warn" : "good"} />)}
      </div>
      <p className="mt-2 text-[0.75rem] text-[var(--color-muted)]">PAR n = outstanding principal of loans whose oldest unpaid instalment is more than n days late, as a share of all outstanding principal.</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_2fr]">
        <Card title="By age">
          <Table head={["Days late", "Loans", "Principal"]}>
            {portfolio.buckets.map((b) => <tr key={b.bucket} className={rowClass}><td className={cell}>{b.bucket === "current" ? "Current" : b.bucket}</td><td className={num}>{b.loans}</td><td className={num}>{ksh(b.outstandingPrincipalCents)}</td></tr>)}
          </Table>
        </Card>
        <Card title={`Late loans (${arrears.total})`} actions={minDays > 1 ? <Link href="/console/arrears" className={secondaryButtonClass}>Show all</Link> : <Link href="/console/arrears?minDays=31" className={secondaryButtonClass}>Over 30 days only</Link>}>
          {arrears.items.length === 0 ? <EmptyState message="Nothing is overdue." /> : (
            <Table head={["Loan", "Member", "Late", "Overdue", "Principal left", "Age"]}>
              {arrears.items.map((r) => (
                <tr key={r.loanId} className={rowClass}>
                  <td className={`${cell} font-mono text-[0.75rem]`}><Link href={`/console/loans/${r.loanId}`} className="text-[var(--color-accent)] underline">{r.loanNo}</Link></td>
                  <td className={cell}>{r.memberName} <span className="text-[0.6875rem] text-[var(--color-faint)]">{r.phone ?? r.memberNo}</span></td>
                  <td className={`${num} font-medium text-[var(--color-danger)]`}>{r.daysOverdue}d</td>
                  <td className={num}>{ksh(r.overduePrincipalCents + r.overdueInterestCents + r.overduePenaltyCents)}</td>
                  <td className={num}>{ksh(r.outstandingPrincipalCents)}</td>
                  <td className={cell}><Badge value={r.bucket} /></td>
                </tr>
              ))}
            </Table>
          )}
          <Pager href={nextOffset !== null ? `/console/arrears?offset=${nextOffset}${minDays > 1 ? `&minDays=${minDays}` : ""}` : null} />
        </Card>
      </div>
    </>
  );
}
