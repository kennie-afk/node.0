import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { appraiseLoan, callGuarantee, decideLoan, disburseLoan, repayLoan, restructureLoan, writeOffLoan } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { LoanDetail } from "@/lib/types";
import { Badge, Card, Download, EmptyState, Field, KeyValue, Notice, PageHeader, Stat, Table, cell, dangerButtonClass, inputClass, num, rowClass, secondaryButtonClass, selectClass, textareaClass } from "@/components/ui";
import { bp, day, ksh, label } from "@/lib/format";

const CHANNELS = [["cash", "Cash"], ["mpesa", "M-Pesa"], ["bank", "Bank"], ["transfer", "Transfer"]];

export default async function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = (await readSession())?.role ?? "";
  const l = await api.get<LoanDetail>(`/v1/loans/${id}`);
  const a = l.appraisal as { monthlyIncomeCents?: number; monthlyExpensesCents?: number; otherDebtServiceCents?: number; largestInstalmentCents?: number; disposableIncomeCents?: number; instalmentFits?: boolean; recommendation?: string; recommendedCents?: number; notes?: string; selfChecked?: boolean } | null;
  const late = (l.arrears?.daysOverdue ?? 0) > 0;

  return (
    <>
      <PageHeader title={`${l.loanNo} · ${ksh(l.principalCents)}`} subtitle={`${l.memberName} (${l.memberNo}) · ${l.termMonths} months at ${bp(l.annualRateBp)} a year, ${l.method === "flat" ? "flat" : "reducing balance"}${l.purpose ? ` · ${l.purpose}` : ""}`} actions={<><Badge value={l.status} /><Link href={`/console/members/${l.memberId}`} className={secondaryButtonClass}>Member</Link>{l.schedule.length > 0 ? <Download href={`/console/download/loan-statement?id=${l.id}`}>Statement CSV</Download> : null}</>} />

      {l.restructuredInto ? <div className="mb-4"><Notice tone="info">This loan was restructured. Its unpaid principal moved onto a new loan.</Notice></div> : null}
      {l.restructuredFrom ? <div className="mb-4"><Notice tone="info">This loan carries the unpaid principal of an earlier loan that was restructured.</Notice></div> : null}

      {l.status === "disbursed" ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Principal outstanding" value={ksh(l.outstandingPrincipalCents)} tone="accent" />
          <Stat label="Total still to pay" value={ksh(l.outstandingTotalCents)} hint="principal, interest and penalties" tone="accent" />
          <Stat label="Days late" value={String(l.arrears?.daysOverdue ?? 0)} tone={late ? "danger" : "good"} hint={late ? `${ksh((l.arrears?.overduePrincipalCents ?? 0) + (l.arrears?.overdueInterestCents ?? 0) + (l.arrears?.overduePenaltyCents ?? 0))} overdue` : "up to date"} />
          <Stat label="Paid out" value={l.disbursedOn ? day(l.disbursedOn) : "–"} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          {l.schedule.length > 0 ? (
            <Card title="Schedule" description={`As at ${day(l.asOf)}. Repayments clear penalties first, then interest, then principal, oldest instalment first.`}>
              <Table head={["#", "Due", "Principal", "Interest", "Penalty", "Paid", "Late"]}>
                {l.schedule.map((r) => {
                  const paid = r.paidPrincipalCents + r.paidInterestCents + r.paidPenaltyCents;
                  const due = r.principalCents + r.interestCents + r.penaltyCents;
                  return <tr key={r.installmentNo} className={rowClass}><td className={cell}>{r.installmentNo}</td><td className={cell}>{day(r.dueDate)}</td><td className={num}>{ksh(r.principalCents)}</td><td className={num}>{ksh(r.interestCents)}</td><td className={num}>{r.penaltyCents ? ksh(r.penaltyCents) : "–"}</td><td className={num}>{paid >= due ? <Badge value="paid" /> : ksh(paid)}</td><td className={`${num} ${r.overdueDays ? "font-medium text-[var(--color-danger)]" : ""}`}>{r.overdueDays ? `${r.overdueDays}d` : "–"}</td></tr>;
                })}
              </Table>
            </Card>
          ) : <Card title="Schedule"><EmptyState message="No schedule yet." detail="It is built on the day the money goes out." /></Card>}
          {l.repayments.length > 0 ? (
            <Card title="Repayments">
              <Table head={["Received", "Channel", "Reference", "Amount", "Penalty", "Interest", "Principal"]}>
                {l.repayments.map((r) => <tr key={r.id} className={rowClass}><td className={cell}>{day(r.receivedOn)}</td><td className={cell}>{label(r.channel)}</td><td className={`${cell} font-mono text-[0.75rem]`}>{r.reference ?? "–"}</td><td className={num}>{ksh(r.amountCents)}</td><td className={num}>{ksh(r.penaltyCents)}</td><td className={num}>{ksh(r.interestCents)}</td><td className={num}>{ksh(r.principalCents)}</td></tr>)}
              </Table>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Terms">
            <KeyValue items={[["Method", l.method === "flat" ? "Flat" : "Reducing balance"], ["Rate", `${bp(l.annualRateBp)} a year`], ["Processing fee", bp(l.fees.processingFeeBp)], ["Insurance fee", bp(l.fees.insuranceFeeBp)], ["Penalty", `${bp(l.penaltyRateBp)} after ${l.graceDays} days`], ["First instalment", l.firstDueDate ? day(l.firstDueDate) : "set when paid out"]]} />
            {l.guarantors.length > 0 ? <div className="mt-4 text-[0.8125rem]"><div className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted)]">Guarantors</div>{l.guarantors.map((g) => <div key={g.memberId}><Link href={`/console/members/${g.memberId}`} className="text-[var(--color-accent)] underline">{g.fullName}</Link> ({g.memberNo}) · {ksh(g.guaranteedCents)}</div>)}</div> : null}
            {l.guarantors.length > 0 && (late || l.status === "written_off") && can(role, "loan_writeoff") ? (
              <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                <div className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted)]">Call a guarantee</div>
                <ActionForm action={callGuarantee} submit="Apply guarantor's savings" button={dangerButtonClass}>
                  <input type="hidden" name="id" value={l.id} />
                  <Field label="Guarantor"><select name="guarantorMemberId" className={selectClass}>{l.guarantors.map((g) => <option key={g.memberId} value={g.memberId}>{g.fullName} ({g.memberNo}), guaranteed {ksh(g.guaranteedCents)}</option>)}</select></Field>
                  <Field label="Amount (KSh)" hint="No more than they guaranteed, and no more than their savings can cover."><input name="amount" inputMode="decimal" required className={inputClass} /></Field>
                </ActionForm>
              </div>
            ) : null}
          </Card>

          {a ? (
            <Card title="Appraisal" description="The arithmetic of what is left each month. It is not a credit decision.">
              <KeyValue items={[["Monthly income", ksh(a.monthlyIncomeCents ?? 0)], ["Monthly expenses", ksh(a.monthlyExpensesCents ?? 0)], ["Other debt payments", ksh(a.otherDebtServiceCents ?? 0)], ["Left each month", ksh(a.disposableIncomeCents ?? 0)], ["Largest instalment", ksh(a.largestInstalmentCents ?? 0)], ["Fits", a.instalmentFits ? "Yes" : "No"], ["Appraiser recommends", label(a.recommendation ?? "–")], ["Recommended amount", a.recommendedCents ? ksh(a.recommendedCents) : "–"]]} />
              {a.notes ? <p className="mt-3 text-[0.8125rem] text-[var(--color-muted)]">{a.notes}</p> : null}
            </Card>
          ) : null}
          {l.decisionNote ? <Card title="Decision note"><p className="text-[0.8125rem]">{l.decisionNote}</p></Card> : null}

          {l.status === "applied" && can(role, "loan_appraise") ? (
            <Card title="Appraise" description="Not the person who took the application.">
              <ActionForm action={appraiseLoan} submit="Record appraisal">
                <input type="hidden" name="id" value={l.id} />
                <Field label="Monthly income (KSh)"><input name="income" inputMode="decimal" required className={inputClass} /></Field>
                <Field label="Monthly expenses (KSh)"><input name="expenses" inputMode="decimal" required className={inputClass} /></Field>
                <Field label="Other loan payments each month (KSh)"><input name="debt" inputMode="decimal" defaultValue="0" className={inputClass} /></Field>
                <Field label="Recommendation"><select name="recommendation" className={selectClass}><option value="approve">Approve</option><option value="approve_reduced">Approve a smaller amount</option><option value="decline">Decline</option></select></Field>
                <Field label="Smaller amount (KSh)" hint="Only if approving a smaller amount."><input name="recommended" inputMode="decimal" className={inputClass} /></Field>
                <Field label="Notes"><textarea name="notes" className={textareaClass} /></Field>
              </ActionForm>
            </Card>
          ) : null}

          {l.status === "appraised" && can(role, "loan_approve") ? (
            <Card title="Decide" description="Not the person who applied or appraised, unless the owner has relaxed that in Settings.">
              <ActionForm action={decideLoan} submit="Approve" className="flex flex-col gap-3">
                <input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="approve" />
                <Field label="Note (optional)"><input name="note" className={inputClass} /></Field>
              </ActionForm>
              <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                <ActionForm action={decideLoan} submit="Decline" button={dangerButtonClass}>
                  <input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="decline" />
                  <Field label="Why it is declined"><input name="note" required className={inputClass} /></Field>
                </ActionForm>
              </div>
            </Card>
          ) : null}

          {l.status === "approved" && can(role, "loan_disburse") ? (
            <Card title="Pay out" description="This posts to the ledger and fixes the schedule. It cannot be undone here.">
              <ActionForm action={disburseLoan} submit="Pay out">
                <input type="hidden" name="id" value={l.id} />
                <Field label="Paid by"><select name="channel" className={selectClass}>{CHANNELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
                <Field label="Reference"><input name="reference" className={inputClass} /></Field>
                <Field label="First instalment due (optional)" hint="Defaults to one month from today."><input name="firstDueDate" type="date" className={inputClass} /></Field>
              </ActionForm>
            </Card>
          ) : null}

          {l.status === "disbursed" && can(role, "loan_repay") ? (
            <Card title="Record a repayment">
              <ActionForm action={repayLoan} submit="Record repayment">
                <input type="hidden" name="id" value={l.id} />
                <Field label="Amount (KSh)"><input name="amount" inputMode="decimal" required className={inputClass} /></Field>
                <Field label="Paid by"><select name="channel" className={selectClass}>{CHANNELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
                <Field label="M-Pesa code or reference"><input name="reference" className={inputClass} /></Field>
              </ActionForm>
            </Card>
          ) : null}

          {l.status === "disbursed" && can(role, "loan_approve") ? (
            <Card title="Restructure" description="Moves the unpaid principal onto a new loan with new terms. Overdue interest and unpaid penalties on this loan are waived (a provisional policy, written to the audit trail).">
              <ActionForm action={restructureLoan} submit="Restructure" button={secondaryButtonClass}>
                <input type="hidden" name="id" value={l.id} />
                <Field label="New term (months)"><input name="newTerm" inputMode="numeric" required className={inputClass} /></Field>
                <Field label="New rate per year (%)" hint="Leave empty to keep the rate."><input name="newRate" inputMode="decimal" className={inputClass} /></Field>
                <Field label="Method"><select name="newMethod" className={selectClass}><option value="">Keep</option><option value="reducing">Reducing balance</option><option value="flat">Flat</option></select></Field>
                <Field label="Why"><input name="note" required className={inputClass} /></Field>
              </ActionForm>
            </Card>
          ) : null}

          {l.status === "disbursed" && late && can(role, "loan_writeoff") ? (
            <Card title="Write off" description="Only for a loan that is overdue. It stays on record.">
              <ActionForm action={writeOffLoan} submit="Write off" button={dangerButtonClass}>
                <input type="hidden" name="id" value={l.id} />
                <Field label="Why"><input name="note" required className={inputClass} /></Field>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
