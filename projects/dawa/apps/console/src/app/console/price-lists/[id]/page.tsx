import Link from "next/link";
import { api } from "@/lib/api";
import { pickProducts, removePriceItem, setPriceItem } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Pager } from "@/components/pager";
import { Picker } from "@/components/picker";
import type { PriceListItems } from "@/lib/types";
import { Card, EmptyState, Field, PageHeader, Table, inputClass, rowClass, secondaryButtonClass } from "@/components/ui";
import { ksh } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function PriceListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; offset?: string }> }) {
  const { id } = await params;
  const { q, offset: rawOffset } = await searchParams;
  const offset = whole(rawOffset);
  const page = await api.get<PriceListItems>(`/v1/price-lists/${id}/items?limit=${PAGE}&offset=${offset}${q ? `&search=${encodeURIComponent(q)}` : ""}`);
  const path = `/console/price-lists/${id}`;
  return (
    <>
      <PageHeader title={page.list.name} subtitle="Products priced differently on this list. Anything not listed is charged the normal list price." actions={<Link href="/console/price-lists" className="text-[0.8125rem] font-medium text-[var(--color-accent)] underline">All lists</Link>} />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title={q ? `Prices matching "${q}"` : "Prices on this list"} actions={<form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search" className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /></form>}>
          {page.items.length === 0 ? <EmptyState message={q ? "Nothing matches that search." : "No products priced yet."} detail={q ? undefined : "Search for a product on the right and set its price."} /> : (
            <>
              <Table head={["Product", "Normal price", "On this list", ""]}>
                {page.items.map((i) => (
                  <tr key={i.productId} className={rowClass}>
                    <td className="px-3.5 py-2.5"><div className="font-medium">{i.name}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{[i.strength, i.form].filter(Boolean).join(" · ")}</div></td>
                    <td className="px-3.5 py-2.5 tabular-nums text-[var(--color-muted)]">{ksh(i.listPriceCents)}</td>
                    <td className="px-3.5 py-2.5 font-medium tabular-nums">{ksh(i.priceCents)}</td>
                    <td className="px-3.5 py-2.5">
                      <ActionForm action={removePriceItem} submit="Remove" button={secondaryButtonClass} className="flex"><input type="hidden" name="listId" value={id} /><input type="hidden" name="productId" value={i.productId} /></ActionForm>
                    </td>
                  </tr>
                ))}
              </Table>
              <Pager from={offset} count={page.items.length} noun="prices" prev={offset > 0 ? href(path, { q, offset: Math.max(0, offset - PAGE) }) : null} next={page.hasMore ? href(path, { q, offset: offset + PAGE }) : null} />
            </>
          )}
        </Card>
        <Card title="Set a price" description="Pick a product and say what this list charges for it. Setting it again changes it.">
          <ActionForm action={setPriceItem} submit="Save price">
            <input type="hidden" name="listId" value={id} />
            <Picker name="productId" search={pickProducts} placeholder="Search for the product" required />
            <Field label="Price (KES)"><input name="price" required inputMode="decimal" className={inputClass} /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
