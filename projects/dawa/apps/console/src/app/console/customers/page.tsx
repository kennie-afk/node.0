import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { addCustomer, customerPayment } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Pager } from "@/components/pager";
import type { Customer, Page } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Table, inputClass, rowClass } from "@/components/ui";
import { ksh } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string; all?: string }> }) {
  const { q, offset: rawOffset, all } = await searchParams;
  const offset = whole(rawOffset);
  const [page, session] = await Promise.all([
    api.get<Page<Customer>>(`/v1/customers?limit=${PAGE}&offset=${offset}${q ? `&search=${encodeURIComponent(q)}` : ""}${all ? "&includeInactive=true" : ""}`),
    readSession()
  ]);
  const rows = page.items;
  const manager = session?.role === "owner" || session?.role === "manager";
  const path = "/console/customers";
  return (
    <>
      <PageHeader title="Customers" subtitle="People who buy on credit. A manager sets the limit; the till refuses a sale that would go over it. Open a customer for their statement and terms." actions={
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Name or phone" className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" />{all ? <input type="hidden" name="all" value="1" /> : null}</form>} />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title={q ? `Customers matching "${q}"` : "Customers"} actions={manager ? <Link href={href(path, { q, all: all ? undefined : 1 })} className="text-[0.75rem] font-medium text-[var(--color-accent)] underline">{all ? "Hide switched-off" : "Show switched-off"}</Link> : undefined}>
          {rows.length === 0 ? <EmptyState message={q ? "Nothing matches that search." : "No customers yet."} /> : (
            <>
              <Table head={["Name", "Limit", "Owes", "Pays"]}>
                {rows.map((c) => (
                  <tr key={c.id} className={rowClass}>
                    <td className="px-3.5 py-2.5"><Link href={`/console/customers/${c.id}`} className="font-medium text-[var(--color-accent)]">{c.name}</Link> {c.active ? null : <Badge value="switched off" />}<div className="text-[0.6875rem] text-[var(--color-faint)]">{c.phone ?? ""}</div></td>
                    <td className="px-3.5 py-2.5 tabular-nums">{c.creditLimitCents ? ksh(c.creditLimitCents) : "No credit"}</td>
                    <td className={`px-3.5 py-2.5 tabular-nums ${c.balanceCents > 0 ? "font-medium text-[var(--color-warn)]" : ""}`}>{ksh(c.balanceCents)}</td>
                    <td className="px-3.5 py-2.5">{c.balanceCents > 0 ? (
                      <ActionForm action={customerPayment} submit="Receive" className="flex items-end gap-2"><input type="hidden" name="id" value={c.id} /><input name="amount" required inputMode="decimal" placeholder="KES" className="w-20 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-[0.8125rem]" /><select name="method" className="rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-[0.8125rem]"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option></select></ActionForm>) : "—"}</td>
                  </tr>
                ))}
              </Table>
              <Pager from={offset} count={rows.length} noun="customers" prev={offset > 0 ? href(path, { q, all, offset: Math.max(0, offset - PAGE) }) : null} next={page.hasMore ? href(path, { q, all, offset: offset + PAGE }) : null} />
            </>
          )}
        </Card>
        <Card title="Add a customer">
          <ActionForm action={addCustomer} submit="Add customer">
            <Field label="Name"><input name="name" required className={inputClass} /></Field>
            <Field label="Phone"><input name="phone" className={inputClass} /></Field>
            {manager ? <Field label="Credit limit (KES)" hint="Leave at 0 for cash customers."><input name="limit" inputMode="decimal" defaultValue={0} className={inputClass} /></Field> : <input type="hidden" name="limit" value="0" />}
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
