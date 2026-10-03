import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { addCustomer, customerPayment } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Customer } from "@/lib/types";
import { Card, EmptyState, Field, PageHeader, Table, inputClass, rowClass } from "@/components/ui";
import { ksh } from "@/lib/format";

export default async function Customers() {
  const [rows, session] = await Promise.all([api.get<Customer[]>("/v1/customers"), readSession()]);
  const manager = session?.role === "owner" || session?.role === "manager";
  return (
    <>
      <PageHeader title="Customers" subtitle="People who buy on credit. A manager sets the limit; the till refuses a sale that would go over it." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title={`${rows.length} customer${rows.length === 1 ? "" : "s"}`}>
          {rows.length === 0 ? <EmptyState message="No customers yet." /> : (
            <Table head={["Name", "Limit", "Owes", "Pays"]}>
              {rows.map((c) => (
                <tr key={c.id} className={rowClass}>
                  <td className="px-3.5 py-2.5"><div className="font-medium">{c.name}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{c.phone ?? ""}</div></td>
                  <td className="px-3.5 py-2.5 tabular-nums">{c.creditLimitCents ? ksh(c.creditLimitCents) : "No credit"}</td>
                  <td className={`px-3.5 py-2.5 tabular-nums ${c.balanceCents > 0 ? "font-medium text-[var(--color-warn)]" : ""}`}>{ksh(c.balanceCents)}</td>
                  <td className="px-3.5 py-2.5">{c.balanceCents > 0 ? (
                    <ActionForm action={customerPayment} submit="Receive" className="flex items-end gap-2"><input type="hidden" name="id" value={c.id} /><input name="amount" required inputMode="decimal" placeholder="KES" className="w-20 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-[0.8125rem]" /><select name="method" className="rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-[0.8125rem]"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option></select></ActionForm>) : "—"}</td>
                </tr>
              ))}
            </Table>
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
