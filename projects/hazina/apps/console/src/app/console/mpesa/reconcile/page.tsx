import Link from "next/link";
import { api } from "@/lib/api";
import { compareMpesaStatement } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Reconciliation } from "@/lib/types";
import { Card, EmptyState, Field, Notice, PageHeader, Stat, Table, cell, inputClass, num, rowClass, secondaryButtonClass } from "@/components/ui";
import { day, ksh, today } from "@/lib/format";

export default async function Reconcile({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const to = sp.to ?? today();
  const from = sp.from ?? new Date(Date.parse(to) - 29 * 86_400_000).toISOString().slice(0, 10);
  const r = await api.get<Reconciliation>(`/v1/mpesa/reconciliation?from=${from}&to=${to}`);
  const off = r.suspense.differenceCents !== 0;

  return (
    <>
      <PageHeader title="M-Pesa reconciliation" subtitle="Money is in the ledger the moment it arrives, held in M-Pesa suspense until it is applied to a member or a loan. This is what arrived, what was applied, and what is still waiting." actions={<Link href="/console/mpesa" className={secondaryButtonClass}>Payments</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Received" value={ksh(r.totals.receivedCents)} hint={`${r.totals.count} payment(s), ${day(r.from)} to ${day(r.to)}`} tone="accent" />
        <Stat label="Applied" value={ksh(r.totals.appliedCents)} tone="good" />
        <Stat label="Unmatched" value={ksh(r.totals.unmatchedCents)} tone={r.totals.unmatchedCents ? "warn" : "good"} />
        <Stat label="In suspense now (ledger)" value={ksh(r.suspense.ledgerCents)} hint={off ? `differs from payments by ${ksh(r.suspense.differenceCents)}` : "agrees with the payments waiting"} tone={off ? "danger" : "good"} />
      </div>
      {off ? <div className="mt-4"><Notice tone="danger">The suspense account in the ledger ({ksh(r.suspense.ledgerCents)}) does not equal the unapplied payments ({ksh(r.suspense.paymentsCents)}). A payment or an entry is missing: compare the payments list with the journal.</Notice></div> : null}
      {r.suspense.unmatchedBeforeSuspenseCount > 0 ? <div className="mt-4"><Notice tone="info">{r.suspense.unmatchedBeforeSuspenseCount} unmatched payment(s) arrived before suspense accounting existed and are not in the suspense account.</Notice></div> : null}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title="By day" description="Days are Nairobi days.">
          <form className="mb-3 flex flex-wrap items-end gap-2" action="/console/mpesa/reconcile">
            <Field label="From"><input name="from" type="date" defaultValue={from} className={inputClass} /></Field>
            <Field label="To"><input name="to" type="date" defaultValue={to} max={today()} className={inputClass} /></Field>
            <button type="submit" className={secondaryButtonClass}>Show</button>
          </form>
          {r.days.length === 0 ? <EmptyState message="No payments in this period." /> : (
            <Table head={["Day", "Payments", "Received", "Applied", "Unmatched", "Set aside"]}>
              {r.days.map((d) => <tr key={d.day} className={rowClass}><td className={cell}>{day(d.day)}</td><td className={num}>{d.count}</td><td className={num}>{ksh(d.receivedCents)}</td><td className={num}>{ksh(d.appliedCents)}</td><td className={num}>{d.unmatchedCents ? ksh(d.unmatchedCents) : "–"}</td><td className={num}>{d.ignoredCents ? ksh(d.ignoredCents) : "–"}</td></tr>)}
            </Table>
          )}
        </Card>
        <Card title="Check against your paybill statement" description="Upload the statement you downloaded from M-Pesa (CSV). Each received payment is matched to Hazina's record by its transaction code. Nothing is posted.">
          <ActionForm action={compareMpesaStatement} submit="Compare">
            <Field label="Statement file (CSV)"><input name="file" type="file" accept=".csv,text/csv" required className={inputClass} /></Field>
          </ActionForm>
          <p className="mt-3 text-[0.75rem] text-[var(--color-muted)]">Not yet checked against a real Safaricom statement: columns are found by their names, and a file that does not look right is refused rather than guessed at.</p>
        </Card>
      </div>
    </>
  );
}
