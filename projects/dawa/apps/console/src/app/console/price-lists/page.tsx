import Link from "next/link";
import { api } from "@/lib/api";
import { createPriceList } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { PriceList } from "@/lib/types";
import { Card, EmptyState, Field, PageHeader, Table, inputClass, rowClass } from "@/components/ui";

export default async function PriceLists() {
  const lists = await api.get<PriceList[]>("/v1/price-lists");
  return (
    <>
      <PageHeader title="Price lists" subtitle="A named set of prices, such as Staff or Insurance. Attach one to a customer and the till charges them these prices instead of the list price." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Lists">
          {lists.length === 0 ? <EmptyState message="No price lists yet." detail="Create one on the right, then add the products it changes." /> : (
            <Table head={["Name", "Products priced", "Customers on it"]}>
              {lists.map((l) => (
                <tr key={l.id} className={rowClass}>
                  <td className="px-3.5 py-2.5"><Link href={`/console/price-lists/${l.id}`} className="font-medium text-[var(--color-accent)]">{l.name}</Link></td>
                  <td className="px-3.5 py-2.5 tabular-nums">{l.itemCount}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{l.customerCount}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="New price list">
          <ActionForm action={createPriceList} submit="Create list"><Field label="Name"><input name="name" required minLength={2} className={inputClass} placeholder="Staff" /></Field></ActionForm>
        </Card>
      </div>
    </>
  );
}
