import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { capacityCheck, idCheck, payslipCheck, postDeposit, setMemberStatus, uploadStatement } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { FlagList } from "@/components/flags";
import type { Intake, MemberProfile, SavingsProduct, SavingsStatement, Settings } from "@/lib/types";
import { Badge, Card, Download, EmptyState, Field, KeyValue, Notice, PageHeader, Stat, Table, cell, inputClass, num, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { day, dayTime, ksh, label } from "@/lib/format";

const PRODUCTS: SavingsProduct[] = ["savings", "shares", "deposits"];

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ product?: string }> }) {
  const { id } = await params;
  const { product: wanted } = await searchParams;
  const product: SavingsProduct = PRODUCTS.includes(wanted as SavingsProduct) ? (wanted as SavingsProduct) : "savings";
  const role = (await readSession())?.role ?? "";
  const [m, settings] = await Promise.all([api.get<MemberProfile>(`/v1/members/${id}`), api.get<Settings>("/v1/settings")]);
  const sacco = settings.organisation.kind === "sacco";
  const [statement, intake] = await Promise.all([
    sacco ? api.get<SavingsStatement>(`/v1/members/${id}/savings-statement?product=${product}`).catch(() => null) : Promise.resolve(null),
    can(role, "intake") ? api.get<Intake>(`/v1/members/${id}/intake`).catch(() => null) : Promise.resolve(null)
  ]);
  const noun = sacco ? "member" : "borrower";

  return (
    <>
      <PageHeader title={m.fullName} subtitle={`${m.memberNo} · ${noun} since ${day(m.joinedOn)}`} actions={<><Badge value={m.status} /><Link href="/console/members" className={secondaryButtonClass}>All {noun}s</Link></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {sacco ? <><Stat label="Savings" value={ksh(m.balances.savingsCents)} tone="accent" /><Stat label="Shares" value={ksh(m.balances.sharesCents)} tone="accent" /><Stat label="Deposits" value={ksh(m.balances.depositsCents)} tone="accent" /></> : null}
        <Stat label="Loan principal owed" value={ksh(m.balances.loanPrincipalOutstandingCents)} tone={m.balances.loanPrincipalOutstandingCents ? "warn" : "good"} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Details">
          <KeyValue items={[["Number (M-Pesa account)", m.memberNo], ["ID number", m.idNumber ?? "–"], ["Phone", m.phone ?? "–"], ["KRA PIN", m.kraPin ?? "–"], ["Date of birth", m.dateOfBirth ? day(m.dateOfBirth) : "–"], ["Gender", m.gender ?? "–"], ["Employer", m.employer ?? "–"], ["Occupation", m.occupation ?? "–"], ["Next of kin", [m.nextOfKin.name, m.nextOfKin.relationship, m.nextOfKin.phone].filter(Boolean).join(" · ") || "–"]]} />
          {can(role, "members_write") ? (
            <ActionForm action={setMemberStatus} submit="Set status" className="mt-5 flex items-end gap-2" button={secondaryButtonClass}>
              <input type="hidden" name="id" value={m.id} />
              <Field label="Status"><select name="status" defaultValue={m.status} className={selectClass}><option value="active">Active</option><option value="dormant">Dormant</option><option value="exited">Exited</option></select></Field>
            </ActionForm>
          ) : null}
        </Card>
        <Card title={`Loans (${m.loans.length})`} actions={can(role, "loan_apply") ? <Link href={`/console/loans/new?memberNo=${m.memberNo}`} className={secondaryButtonClass}>New application</Link> : undefined}>
          {m.loans.length === 0 ? <EmptyState message="No loans." /> : (
            <Table head={["Loan", "Principal", "Status"]}>
              {m.loans.map((l) => <tr key={l.id} className={rowClass}><td className={`${cell} font-mono text-[0.75rem]`}><Link href={`/console/loans/${l.id}`} className="text-[var(--color-accent)] underline">{l.loanNo}</Link></td><td className={num}>{ksh(l.principalCents)}</td><td className={cell}><Badge value={l.status} /></td></tr>)}
            </Table>
          )}
        </Card>
      </div>

      {sacco ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card title="Statement" actions={<div className="flex items-center gap-1.5">{PRODUCTS.map((p) => <Link key={p} href={`/console/members/${id}?product=${p}`} className={p === product ? "rounded-md bg-[var(--color-ink)] px-2.5 py-1 text-[0.75rem] font-medium text-white" : "rounded-md px-2.5 py-1 text-[0.75rem] font-medium text-[var(--color-muted)]"}>{label(p)}</Link>)}<Download href={`/console/download/member-statement?id=${id}&product=${product}`}>CSV</Download></div>}>
            {!statement || statement.lines.length === 0 ? <EmptyState message={`No ${product} movements yet.`} /> : (
              <Table head={["Date", "Kind", "Channel", "Reference", "Amount", "Balance"]}>
                {statement.lines.map((l) => <tr key={l.id} className={rowClass}><td className={cell}>{day(l.date)}</td><td className={cell}>{label(l.kind)}</td><td className={`${cell} text-[var(--color-muted)]`}>{label(l.channel)}</td><td className={`${cell} font-mono text-[0.75rem]`}>{l.reference ?? "–"}</td><td className={num}>{ksh(l.amountCents)}</td><td className={num}>{ksh(l.balanceCents)}</td></tr>)}
              </Table>
            )}
          </Card>
          {can(role, "savings_post") ? (
            <Card title="Record a deposit">
              <ActionForm action={postDeposit} submit="Record deposit">
                <input type="hidden" name="memberNo" value={m.memberNo} />
                <Field label="Into"><select name="product" defaultValue={product} className={selectClass}>{PRODUCTS.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select></Field>
                <Field label="Amount (KSh)"><input name="amount" inputMode="decimal" required className={inputClass} /></Field>
                <Field label="Paid by"><select name="channel" className={selectClass}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="transfer">Transfer</option></select></Field>
                <Field label="M-Pesa code or reference"><input name="reference" className={inputClass} /></Field>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {intake ? <IntakeSection memberId={m.id} intake={intake} /> : null}
    </>
  );
}

function IntakeSection({ memberId, intake }: { memberId: string; intake: Intake }) {
  const parsed = intake.statements.filter((s) => s.status === "parsed");
  return (
    <div className="mt-5">
      <Notice tone="info">
        <strong>Document checks.</strong> These are arithmetic and format flags for a loan officer to read. They do not verify a statement, a payslip or an ID, they never approve or decline anything, and an edited document can pass every one. Safaricom statement layouts have not been tested against real files here: compare the figures with the file before relying on them.
      </Notice>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <Card title="M-Pesa statement" description="CSV or PDF (up to 6 MB). The figures are what came in and went out and how regular it was.">
          <ActionForm action={uploadStatement} submit="Read statement">
            <input type="hidden" name="memberId" value={memberId} />
            <input type="file" name="file" accept=".csv,.pdf,text/csv,application/pdf,text/plain" required className="text-[0.8125rem]" />
          </ActionForm>
          <div className="mt-5 flex flex-col gap-4">
            {intake.statements.map((s) => (
              <div key={s.id} className="rounded-lg border border-[var(--color-line)] p-3 text-[0.8125rem]">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{s.filename}</span><span><Badge value={s.status} /> <span className="text-[0.6875rem] text-[var(--color-faint)]">{dayTime(s.createdAt)}</span></span></div>
                {s.status !== "parsed" ? <p className="mt-2 text-[var(--color-danger)]">{s.error ?? "The file could not be read."}</p> : s.summary ? (
                  <div className="mt-3">
                    <KeyValue items={[["Period", `${day(s.summary.periodStart)} – ${day(s.summary.periodEnd)} (${s.summary.monthsCovered} months)`], ["Average monthly inflow", ksh(s.summary.averageMonthlyInflowCents)], ["Lowest month", ksh(s.summary.lowestMonthlyInflowCents)], ["Average monthly outflow", ksh(s.summary.averageMonthlyOutflowCents)], ["Months with regular inflow", `${s.summary.regularMonthsPercent}%`], ["Indicative ceiling for an instalment", `${ksh(s.summary.indicativeCapacityCents)} (${s.summary.capacityShareBp / 100}% of average inflow)`]]} />
                    <div className="mt-3"><FlagList flags={s.flags} /></div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {parsed.length > 0 ? (
            <div className="mt-5 border-t border-[var(--color-line)] pt-4">
              <h3 className="mb-2 text-[0.8125rem] font-semibold">Compare an instalment with a statement</h3>
              <ActionForm action={capacityCheck} submit="Compare" button={secondaryButtonClass}>
                <Field label="Statement"><select name="uploadId" className={selectClass}>{parsed.map((s) => <option key={s.id} value={s.id}>{s.filename}</option>)}</select></Field>
                <Field label="Monthly instalment (KSh)"><input name="instalment" inputMode="decimal" required className={inputClass} /></Field>
              </ActionForm>
            </div>
          ) : null}
        </Card>
        <div className="flex flex-col gap-5">
          <Card title="Payslip add-up check" description="Statutory deductions are not recomputed: rates change and Hazina does not know today's.">
            <ActionForm action={payslipCheck} submit="Check payslip">
              <input type="hidden" name="memberId" value={memberId} />
              <div className="grid grid-cols-3 gap-2"><Field label="Gross"><input name="gross" inputMode="decimal" required className={inputClass} /></Field><Field label="Net"><input name="net" inputMode="decimal" required className={inputClass} /></Field><Field label="Month"><input name="month" placeholder="2026-09" className={inputClass} /></Field></div>
              {[1, 2, 3, 4].map((i) => <div key={i} className="grid grid-cols-[2fr_1fr] gap-2"><input name={`dName${i}`} placeholder={`Deduction ${i} name`} className={inputClass} /><input name={`dAmount${i}`} inputMode="decimal" placeholder="Amount" className={inputClass} /></div>)}
            </ActionForm>
          </Card>
          <Card title="ID number format check" description="Commonly 7 or 8 digits; a different length is a prompt to look closer, not a rule.">
            <ActionForm action={idCheck} submit="Check ID number"><input type="hidden" name="memberId" value={memberId} /><Field label="ID number as shown on the document"><input name="idNumber" required className={inputClass} /></Field></ActionForm>
          </Card>
        </div>
      </div>
      {intake.checks.length > 0 ? (
        <div className="mt-5"><Card title="Earlier checks">
          <div className="flex flex-col gap-3">{intake.checks.map((c) => <div key={c.id} className="text-[0.8125rem]"><div className="mb-1.5 font-medium">{c.kind === "payslip" ? "Payslip" : "National ID"} <span className="text-[0.6875rem] font-normal text-[var(--color-faint)]">{dayTime(c.createdAt)}</span></div><FlagList flags={c.flags} /></div>)}</div>
        </Card></div>
      ) : null}
    </div>
  );
}
