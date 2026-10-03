import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { ksh } from "@/lib/format";
import { link, pageOf, sp, type SearchParams } from "@/lib/query";
import type { Adjustment, Compliance, Guard, Page, Payslip, Period } from "@/lib/types";
import { addAdjustment, closePayroll, runPayroll } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Download, EmptyState, Field, Notice, PageHeader, Paging, Stat, Table, cell, dangerButtonClass, inputClass, rowClass, secondaryButtonClass, selectClass, buttonClass } from "@/components/ui";

export default async function MonthPage({ params, searchParams }: { params: Promise<{ month: string }>; searchParams: SearchParams }) {
  const { month } = await params;
  const q = await sp(searchParams);
  const session = (await readSession())!;
  if (!can(session.role, "salary_view")) redirect("/console");
  const [period, report] = await Promise.all([api.get<Period | { status: "not_started" }>(`/v1/payroll/periods/${month}`), api.get<Compliance>(`/v1/payroll/compliance/${month}`)]);
  const closed = period.status === "closed";
  const started = period.status !== "not_started";
  const slips = started ? await api.get<Page<Payslip> & { period: Period | null }>(`/v1/payroll/periods/${month}/payslips?page=${pageOf(q)}&pageSize=25${q.flagged ? "&flagged=true" : ""}${q.q ? `&q=${encodeURIComponent(q.q)}` : ""}`) : null;
  const adjustments = await api.get<Page<Adjustment>>(`/v1/payroll/adjustments?month=${month}&pageSize=20`);
  const run = can(session.role, "payroll_run");
  const unconfirmed = report.deductionTables.filter((t) => t.status === "unconfirmed").map((t) => t.kind);
  const guards = run && !closed ? await api.get<Page<Guard>>("/v1/guards?pageSize=100&status=active") : null;
  return (
    <>
      <PageHeader title={`Payroll ${month}`} subtitle={closed ? "Closed. Nothing here can change; corrections are adjustments in an open month." : "Open. Run it as often as you like until the figures are right, then close it."} actions={<>{started ? <Download href={`/files/exports/payroll/${month}.csv`}>Payroll register (CSV)</Download> : null}<Download href={`/files/exports/compliance/${month}.csv`}>Compliance (CSV)</Download></>} />
      <div className="mb-4"><Notice tone="warn">{report.notice}</Notice></div>
      {unconfirmed.length > 0 && !closed ? <div className="mb-4"><Notice tone="danger">Deduction tables not confirmed: <strong>{unconfirmed.join(", ")}</strong>. Until you confirm them nothing is deducted for those lines, and the month cannot be closed. <Link href="/console/payroll/tables" className="underline">Open the tables</Link></Notice></div> : null}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Guards in the month" value={String(report.guards)} tone="accent" />
        <Stat label="Below the minimum" value={String(report.belowMinimum.length)} tone={report.belowMinimum.length ? "danger" : "good"} hint={`minimum ${ksh(report.minimumWageCents)}`} />
        <Stat label="Shifts with no check-out" value={String(report.unresolvedShifts)} tone={report.unresolvedShifts ? "warn" : "good"} />
        <Stat label="Missing PSRA no." value={String(report.flagCounts.missing_psra_reg ?? 0)} tone={report.flagCounts.missing_psra_reg ? "warn" : "good"} />
        <Stat label="PSRA expired (as typed)" value={String(report.flagCounts.psra_expired ?? 0)} tone={report.flagCounts.psra_expired ? "warn" : "good"} />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card title="Guards paid below the minimum" description={report.allowancesCountTowardMin ? "Allowances count toward the minimum (your setting)." : "Allowances do not count toward the minimum (your setting). Overtime and premiums never do."}>
          {report.belowMinimum.length === 0 ? <EmptyState message="Nobody is below the minimum you configured." /> : (
            <Table head={["Guard", "Days", "Basic", "Required", "Short by"]}>{report.belowMinimum.map((b) => <tr key={b.guardId} className={rowClass}><td className={cell}><Link href={`/console/guards/${b.guardId}`} className="hover:underline">{b.guardName}</Link><div className="text-[0.6875rem] text-[var(--color-faint)]">{b.guardNo}</div></td><td className={cell}>{b.daysEmployed}</td><td className={`${cell} tabular-nums`}>{ksh(b.basicCents)}</td><td className={`${cell} tabular-nums`}>{ksh(b.requiredCents)}</td><td className={`${cell} tabular-nums text-[var(--color-danger)]`}>{ksh(b.shortfallCents)}</td></tr>)}</Table>
          )}
        </Card>
        {run ? (
          <Card title={closed ? "This month is closed" : "Run and close"}>
            {closed ? <p className="text-[0.8125rem] text-[var(--color-muted)]">Closed by {(period as Period).closedBy}. {(period as Period).snapshot?.acknowledged ? `Acknowledged: ${(period as Period).snapshot?.acknowledged}` : ""}</p> : (
              <div className="flex flex-col gap-4">
                <ActionForm action={runPayroll} submit={started ? "Run again" : "Run payroll"} button={buttonClass}><input type="hidden" name="month" value={month} /></ActionForm>
                {started && can(session.role, "payroll_close") ? (
                  <ActionForm action={closePayroll} submit="Close the month for good" button={dangerButtonClass}>
                    <input type="hidden" name="month" value={month} />
                    <Field label="Acknowledgement" hint="Needed only if a guard is below the minimum, a net is negative, or a shift has no check-out. Say what you know and why you are closing anyway; it is kept on record."><textarea name="acknowledge" className={`${inputClass} min-h-[64px]`} /></Field>
                  </ActionForm>
                ) : null}
              </div>
            )}
          </Card>
        ) : null}
      </div>
      <Card title="Payslips" actions={<form method="get" className="flex items-center gap-2"><input name="q" defaultValue={q.q ?? ""} placeholder="Name or number" className={inputClass} /><label className="flex items-center gap-1 text-[0.75rem]"><input type="checkbox" name="flagged" value="true" defaultChecked={!!q.flagged} />flagged only</label><button className={secondaryButtonClass} type="submit">Filter</button></form>}>
        {!slips || slips.items.length === 0 ? <EmptyState message={started ? "No payslips match." : "Not run yet."} detail="Run payroll to compute every guard's pay for the month." /> : (
          <Table head={["Guard", "Days", "Gross", "Deductions", "Net", "Flags", ""]}>{slips.items.map((s) => (
            <tr key={s.id} className={rowClass}>
              <td className={cell}>{s.guardName}<div className="text-[0.6875rem] text-[var(--color-faint)]">{s.guardNo}</div></td><td className={cell}>{s.daysEmployed}/{s.daysInMonth}</td>
              <td className={`${cell} tabular-nums`}>{ksh(s.grossCents)}{s.overtimeCents + s.premiumCents > 0 ? <div className="text-[0.6875rem] text-[var(--color-faint)]">incl. {ksh(s.overtimeCents + s.premiumCents)} extra</div> : null}</td>
              <td className={`${cell} tabular-nums`}>{ksh(s.employeeDeductionsCents)}</td><td className={`${cell} font-medium tabular-nums`}>{ksh(s.netCents)}</td>
              <td className={cell}>{s.belowMinimum ? <Badge value="below minimum" /> : null}{s.flags.filter((f) => f.code !== "below_minimum").length ? <span className="ml-1 text-[0.6875rem] text-[var(--color-warn)]">{s.flags.filter((f) => f.code !== "below_minimum").map((f) => f.code.replace("missing_", "no ").replace("_", " ")).join(", ")}</span> : null}</td>
              <td className={cell}><a className={secondaryButtonClass} href={`/files/payslips/${s.id}/print`} target="_blank">Payslip</a></td>
            </tr>
          ))}</Table>
        )}
        {slips ? <Paging page={slips.page} pageSize={slips.pageSize} total={slips.total} href={(p) => link(`/console/payroll/${month}`, q, { page: p })} /> : null}
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Adjustments paid this month" description="Corrections, arrears, bonuses and recoveries. Never edited: undo one with another.">
          {adjustments.items.length === 0 ? <EmptyState message="None." /> : <Table head={["Guard", "Kind", "Amount", "Why"]}>{adjustments.items.map((a) => <tr key={a.id} className={rowClass}><td className={cell}>{a.guard}<div className="text-[0.6875rem] text-[var(--color-faint)]">{a.guardNo}</div></td><td className={cell}>{a.kind}{a.relatedMonth ? <div className="text-[0.6875rem] text-[var(--color-faint)]">for {a.relatedMonth}</div> : null}</td><td className={`${cell} tabular-nums`}>{ksh(a.amountCents)}</td><td className={cell}>{a.reason}</td></tr>)}</Table>}
        </Card>
        {run && !closed && guards ? (
          <Card title="Add an adjustment" description="Paid in this month. Correcting a closed month? Put the closed month in 'corrects'.">
            <ActionForm action={addAdjustment} submit="Record it">
              <input type="hidden" name="effectiveMonth" value={month} />
              <Field label="Guard"><select name="guardId" required className={selectClass}>{guards.items.map((g) => <option key={g.id} value={g.id}>{g.guardNo} · {g.fullName}</option>)}</select></Field>
              <div className="grid grid-cols-3 gap-2"><Field label="Direction"><select name="direction" className={selectClass}><option value="plus">Pay more</option><option value="minus">Deduct</option></select></Field><Field label="Amount (KES)"><input name="amount" type="number" min={0.01} step="0.01" required className={inputClass} /></Field><Field label="Kind"><select name="kind" className={selectClass}>{["correction", "arrears", "bonus", "deduction", "reversal"].map((k) => <option key={k}>{k}</option>)}</select></Field></div>
              <Field label="Corrects month" hint="Optional."><input name="relatedMonth" type="month" className={inputClass} /></Field>
              <Field label="Reason"><input name="reason" required minLength={5} className={inputClass} /></Field>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
