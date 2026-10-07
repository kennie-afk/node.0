import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { customerPayment, saveCustomerTerms } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Pager } from "@/components/pager";
import type { PriceList, Statement } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Stat, Table, inputClass, rowClass, selectClass } from "@/components/ui";
import { dayTime, ksh } from "@/lib/format";
import { PAGE, href } from "@/lib/paging";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string }> }) {
  const { id } = await params;
  const { before } = await searchParams;
  const session = await readSession();
  const manager = session?.role === "owner" || session?.role === "manager";
  const [s, lists] = await Promise.all([
    api.get<Statement>(`/v1/customers/${id}/statement?limit=${PAGE}${before ? `&before=${encodeURIComponent(before)}` : ""}`),
    manager ? api.get<PriceList[]>("/v1/price-lists").catch(() => [] as PriceList[]) : Promise.resolve([] as PriceList[])
  ]);
  const c = s.customer;
  const path = `/console/customers/${id}`;
  const listName = lists.find((l) => l.id === c.priceListId)?.name;
  const available = Math.max(0, c.creditLimitCents - s.balanceCents);
  return (
    <>
      <PageHeader title={c.name} subtitle={[c.phone, c.active ? null : "switched off"].filter(Boolean).join(" · ") || "Customer account"} actions={<Link href="/console/customers" className="text-[0.8125rem] font-medium text-[var(--color-accent)] underline">All customers</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Owes" value={ksh(s.balanceCents)} tone={s.balanceCents > 0 ? "warn" : "good"} />
        <Stat label="Credit limit" value={c.creditLimitCents ? ksh(c.creditLimitCents) : "None"} tone="accent" />
        <Stat label="Credit left" value={c.creditLimitCents ? ksh(available) : "—"} tone="accent" />
        <Stat label="Price list" value={listName ?? (c.priceListId ? "Set" : "List prices")} tone="accent" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Statement" description="Every charge and payment, newest first. Entries are never edited; a mistake is put right with a new entry.">
          {s.entries.length === 0 ? <EmptyState message="Nothing on this account yet." /> : (
            <>
              <Table head={["When", "Entry", "Amount", "Note"]}>
                {s.entries.map((e) => (
                  <tr key={e.id} className={rowClass}>
                    <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{dayTime(e.at)}</td>
                    <td className="px-3.5 py-2.5"><Badge value={e.kind} /></td>
                    <td className={`px-3.5 py-2.5 tabular-nums ${e.amountCents > 0 ? "text-[var(--color-warn)]" : "text-[var(--color-good)]"}`}>{e.amountCents > 0 ? `+${ksh(e.amountCents)}` : ksh(e.amountCents)}</td>
                    <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{e.note ?? ""}</td>
                  </tr>
                ))}
              </Table>
              <Pager from={0} count={s.entries.length} noun="entries" prev={before ? path : null} next={s.hasMore && s.next ? href(path, { before: s.next }) : null} />
            </>
          )}
        </Card>
        <div className="flex flex-col gap-5">
          {s.balanceCents > 0 ? (
            <Card title="Receive a payment">
              <ActionForm action={customerPayment} submit="Record payment" className="grid items-end gap-2 sm:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                <Field label="Amount (KES)"><input name="amount" required inputMode="decimal" defaultValue={(s.balanceCents / 100).toString()} className={inputClass} /></Field>
                <Field label="Method"><select name="method" className={selectClass} defaultValue="cash"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option></select></Field>
                <div className="sm:col-span-2"><Field label="Reference"><input name="reference" className={inputClass} /></Field></div>
              </ActionForm>
            </Card>
          ) : null}
          {manager ? (
            <Card title="Credit terms" description="The limit the till enforces, the price list this customer buys at, and whether the account is in use.">
              <ActionForm action={saveCustomerTerms} submit="Save terms">
                <input type="hidden" name="id" value={c.id} />
                <Field label="Credit limit (KES)" hint="0 means cash only."><input name="limit" inputMode="decimal" defaultValue={(c.creditLimitCents / 100).toString()} className={inputClass} /></Field>
                <Field label="Price list"><select name="priceListId" className={selectClass} defaultValue={c.priceListId ?? ""}><option value="">List prices</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
                <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" name="active" defaultChecked={c.active} /> Account in use</label>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
