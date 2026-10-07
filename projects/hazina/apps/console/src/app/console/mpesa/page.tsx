import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { assignPayment, ignorePayment, simulateMpesa } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Branch, MpesaPayment, Paged, Settings } from "@/lib/types";
import { Badge, Card, Download, EmptyState, Field, Notice, PageHeader, Pager, Table, cell, dangerButtonClass, inputClass, num, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { dayTime, ksh, label } from "@/lib/format";
import Link from "next/link";

export default async function Mpesa({ searchParams }: { searchParams: Promise<{ status?: string; search?: string; after?: string }> }) {
  const { status, search, after } = await searchParams;
  const role = (await readSession())?.role ?? "";
  const [page, settings, branches] = await Promise.all([
    api.get<Paged<MpesaPayment>>(`/v1/mpesa/payments?${new URLSearchParams({ limit: "50", ...(status ? { status } : {}), ...(search ? { search } : {}), ...(after ? { after } : {}) })}`),
    api.get<Settings>("/v1/settings"),
    api.get<Branch[]>("/v1/branches").catch(() => [] as Branch[])
  ]);
  const payments = page.items;
  const more = new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}), ...(page.nextCursor ? { after: page.nextCursor } : {}) });
  const sacco = settings.organisation.kind === "sacco";
  const hasPaybill = branches.some((b) => !b.isSample && b.paybillNumber);
  const simulator = settings.capabilities?.mpesaSimulator === true;
  const tabs = [["", "All"], ["unmatched", "Unmatched"], ["applied", "Matched"], ["ignored", "Set aside"]];

  return (
    <>
      <PageHeader title="M-Pesa payments" subtitle={`Members pay your paybill quoting a ${sacco ? "member number (M00001; add SH for shares or DP for deposits) or a " : ""}loan number (L00001). A payment that names nobody waits here for a person: it is never dropped and never guessed.`} actions={<><Link href="/console/mpesa/reconcile" className={secondaryButtonClass}>Reconciliation</Link><Download href="/console/download/mpesa-payments">Download CSV</Download></>} />
      {!hasPaybill ? <div className="mb-4"><Notice tone="warn">No paybill number is set yet, so no live payment can be matched to this organisation. <Link href="/console/branches" className="underline">Set it under Branches</Link>.</Notice></div> : null}
      <div className="grid gap-5 lg:grid-cols-[1.8fr_1fr]">
        <Card>
          <nav className="mb-3 flex gap-1">{tabs.map(([s, t]) => <Link key={s || "all"} href={`/console/mpesa${s ? `?status=${s}` : ""}`} className={(status ?? "") === s ? "rounded-md bg-[var(--color-ink)] px-2.5 py-1 text-[0.75rem] font-medium text-white" : "rounded-md px-2.5 py-1 text-[0.75rem] font-medium text-[var(--color-muted)]"}>{t}</Link>)}</nav>
          <form className="mb-3 flex flex-wrap items-end gap-2" action="/console/mpesa">
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <div className="min-w-[200px] flex-1"><Field label="Search"><input name="search" defaultValue={search ?? ""} placeholder="M-Pesa code, account reference or phone" className={inputClass} /></Field></div>
            <button type="submit" className={secondaryButtonClass}>Search</button>
          </form>
          {payments.length === 0 ? <EmptyState message={search ? "No payment matches that." : "No payments here."} /> : (
            <div className="flex flex-col divide-y divide-[var(--color-line)]">
              {payments.map((p) => (
                <div key={p.id} className="py-3 text-[0.8125rem]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><span className="font-mono text-[0.75rem]">{p.externalRef}</span> · <strong className="tabular-nums">{ksh(p.amountCents)}</strong> · account “{p.billRef || "none"}” · {p.payer ?? "unknown payer"}</div>
                    <div className="flex items-center gap-2"><span className="text-[0.6875rem] text-[var(--color-faint)]">{dayTime(p.receivedAt)}</span><Badge value={p.status} /></div>
                  </div>
                  {p.note ? <p className="mt-1 text-[0.75rem] text-[var(--color-muted)]">{p.note}</p> : null}
                  {p.status === "applied" ? <p className="mt-1 text-[0.75rem] text-[var(--color-muted)]">Applied to {label(p.appliedToType ?? "")}{p.unappliedCents ? `, ${ksh(p.unappliedCents)} held unapplied` : ""}.</p> : null}
                  {p.status === "unmatched" && can(role, "recon") ? (
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <ActionForm action={assignPayment} submit="Assign" button={secondaryButtonClass} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <Field label="Loan or member number"><input name="target" required placeholder="L00001 or M00001" className={inputClass} /></Field>
                        {sacco ? <Field label="If a member"><select name="product" className={selectClass}><option value="savings">Savings</option><option value="shares">Shares</option><option value="deposits">Deposits</option></select></Field> : null}
                      </ActionForm>
                      <ActionForm action={ignorePayment} submit="Set aside" button={dangerButtonClass} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <Field label="Why"><input name="note" required minLength={3} className={inputClass} /></Field>
                      </ActionForm>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <Pager href={page.nextCursor ? `/console/mpesa?${more}` : null} label="Older payments" />
        </Card>
        <div className="flex flex-col gap-5">
          <Card title="How matching works">
            <ul className="list-disc space-y-1.5 pl-4 text-[0.8125rem] text-[var(--color-muted)]">
              <li>The reference is read in any case, with or without spaces or dashes.</li>
              <li>A loan repayment is split penalty, then interest, then principal. Anything above what is owed is held unapplied, not lost.</li>
              <li>Money is booked to M-Pesa suspense the moment it arrives and leaves suspense when it is applied, so unmatched money shows in the trial balance.</li>
              <li>Each M-Pesa code is accepted once, so a repeated callback cannot double a payment.</li>
              <li><strong>Live Daraja callbacks have not been received on this installation.</strong> Register the confirmation URL with Safaricom first (see the runbook).</li>
            </ul>
          </Card>
          {simulator && can(role, "recon") ? (
            <Card title="Simulate a payment" description="For demos only: builds a Daraja-shaped confirmation and runs it through the same matching. No money moves.">
              <ActionForm action={simulateMpesa} submit="Simulate">
                <Field label="Account reference"><input name="billRef" placeholder="M00001 or L00001" className={inputClass} /></Field>
                <Field label="Amount (KSh)"><input name="amount" inputMode="decimal" required className={inputClass} /></Field>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
