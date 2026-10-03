import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { decideWithdrawal, postDeposit, requestWithdrawal } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { SavingsTxn, Settings } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Table, cell, dangerButtonClass, inputClass, num, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { day, ksh, label } from "@/lib/format";

const CHANNELS = [["cash", "Cash"], ["mpesa", "M-Pesa"], ["bank", "Bank"], ["transfer", "Transfer"]];

export default async function Savings() {
  const role = (await readSession())?.role ?? "";
  const settings = await api.get<Settings>("/v1/settings");
  if (settings.organisation.kind !== "sacco") return <><PageHeader title="Savings" /><EmptyState message="A lender does not take savings, shares or deposits." /></>;
  const [pending, recent] = await Promise.all([
    api.get<SavingsTxn[]>("/v1/savings?status=pending_approval&limit=100"),
    api.get<SavingsTxn[]>("/v1/savings?limit=40")
  ]);
  const limit = settings.settings.withdrawalApprovalCents;

  return (
    <>
      <PageHeader title="Savings, shares and deposits" subtitle={`Withdrawals of ${ksh(limit)} or more wait for a manager or owner other than the person who asked. Members with a loan in arrears cannot withdraw.`} />
      {pending.length > 0 ? (
        <div className="mb-5"><Card title={`Waiting for approval (${pending.length})`}>
          <Table head={["Member", "Requested", "Amount", "Channel", "Decision"]}>
            {pending.map((t) => (
              <tr key={t.id} className={rowClass}>
                <td className={cell}><Link href={`/console/members/${t.memberId}`} className="text-[var(--color-accent)] underline">{t.memberName}</Link> <span className="font-mono text-[0.6875rem] text-[var(--color-faint)]">{t.memberNo}</span></td>
                <td className={cell}>{day(t.occurredOn)}</td>
                <td className={num}>{ksh(t.amountCents)}</td>
                <td className={cell}>{label(t.channel)}</td>
                <td className={cell}>{can(role, "withdraw_approve") ? (
                  <div className="flex gap-2">
                    <ActionForm action={decideWithdrawal} submit="Approve" button={secondaryButtonClass} className="flex"><input type="hidden" name="id" value={t.id} /><input type="hidden" name="decision" value="approve" /></ActionForm>
                    <ActionForm action={decideWithdrawal} submit="Reject" button={dangerButtonClass} className="flex"><input type="hidden" name="id" value={t.id} /><input type="hidden" name="decision" value="reject" /><input type="hidden" name="note" value="Rejected" /></ActionForm>
                  </div>) : <span className="text-[var(--color-muted)]">A manager or owner</span>}</td>
              </tr>
            ))}
          </Table>
        </Card></div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Recent movements">
          {recent.length === 0 ? <EmptyState message="Nothing recorded yet." /> : (
            <Table head={["Date", "Member", "Kind", "Into", "Amount", "Status"]}>
              {recent.map((t) => <tr key={t.id} className={rowClass}><td className={cell}>{day(t.occurredOn)}</td><td className={cell}>{t.memberName} <span className="font-mono text-[0.6875rem] text-[var(--color-faint)]">{t.memberNo}</span></td><td className={cell}>{label(t.kind)}</td><td className={cell}>{label(t.product)}</td><td className={num}>{ksh(t.amountCents)}</td><td className={cell}><Badge value={t.status} /></td></tr>)}
            </Table>
          )}
        </Card>
        {can(role, "savings_post") ? (
          <div className="flex flex-col gap-5">
            <Card title="Record a deposit">
              <ActionForm action={postDeposit} submit="Record deposit">
                <Field label="Member number"><input name="memberNo" required placeholder="M00001" className={inputClass} /></Field>
                <Field label="Into"><select name="product" className={selectClass}><option value="savings">Savings</option><option value="shares">Shares</option><option value="deposits">Deposits</option></select></Field>
                <Field label="Amount (KSh)"><input name="amount" inputMode="decimal" required className={inputClass} /></Field>
                <Field label="Paid by"><select name="channel" className={selectClass}>{CHANNELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
                <Field label="M-Pesa code or reference" hint="An M-Pesa deposit needs the code. The same code cannot be recorded twice."><input name="reference" className={inputClass} /></Field>
              </ActionForm>
            </Card>
            <Card title="Withdraw savings">
              <ActionForm action={requestWithdrawal} submit="Withdraw">
                <Field label="Member number"><input name="memberNo" required placeholder="M00001" className={inputClass} /></Field>
                <Field label="Amount (KSh)"><input name="amount" inputMode="decimal" required className={inputClass} /></Field>
                <Field label="Paid by"><select name="channel" className={selectClass}>{CHANNELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
                <Field label="Reference"><input name="reference" className={inputClass} /></Field>
              </ActionForm>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
