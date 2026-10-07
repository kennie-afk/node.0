import { api } from "@/lib/api";
import { saveProduct } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Pager } from "@/components/pager";
import type { Page, Product } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Table, inputClass, rowClass, selectClass } from "@/components/ui";
import { ksh } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function Products({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string }> }) {
  const { q, offset: rawOffset } = await searchParams;
  const offset = whole(rawOffset);
  const { items, total, hasMore } = await api.get<Page<Product> & { total: number }>(`/v1/products?limit=${PAGE}&offset=${offset}${q ? `&search=${encodeURIComponent(q)}` : ""}`);
  const path = "/console/products";
  return (
    <>
      <PageHeader title="Products" subtitle="Your catalogue. Say how each medicine is classified: you decide that, Dawa does not." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title={`${total} product${total === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}`} actions={
          <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search" className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /></form>}>
          {items.length === 0 ? <EmptyState message={q ? "Nothing matches that search." : "No products yet."} detail={q ? undefined : "Add your first one on the right."} /> : (
            <>
              <Table head={["Product", "Class", "GTIN", "Price", "Reorder at"]}>
                {items.map((p) => (
                  <tr key={p.id} className={rowClass}>
                    <td className="px-3.5 py-2.5"><div className="font-medium">{p.name}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{[p.strength, p.form, p.packSize].filter(Boolean).join(" · ")}</div></td>
                    <td className="px-3.5 py-2.5">{p.category === "otc" ? <span className="text-[var(--color-muted)]">Over the counter</span> : <Badge value={p.category} />}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[0.75rem] text-[var(--color-muted)]">{p.gtin ?? "—"}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">{ksh(p.listPriceCents)}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">{p.reorderLevel || "—"}</td>
                  </tr>
                ))}
              </Table>
              <Pager from={offset} count={items.length} noun="products" prev={offset > 0 ? href(path, { q, offset: Math.max(0, offset - PAGE) }) : null} next={hasMore ? href(path, { q, offset: offset + PAGE }) : null} />
            </>
          )}
        </Card>
        <Card title="Add a product">
          <ActionForm action={saveProduct} submit="Add product">
            <Field label="Name"><input name="name" required className={inputClass} placeholder="Amoxicillin 500mg capsules" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Strength"><input name="strength" className={inputClass} placeholder="500mg" /></Field>
              <Field label="Form"><input name="form" className={inputClass} placeholder="Capsule" /></Field>
              <Field label="Pack"><input name="packSize" className={inputClass} placeholder="Strip of 10" /></Field>
              <Field label="Price (KES)"><input name="price" required inputMode="decimal" className={inputClass} placeholder="120" /></Field>
            </div>
            <Field label="Class" hint="Prescription and controlled items need a dispensing record at the till; controlled ones also need a witness."><select name="category" className={selectClass} defaultValue="otc"><option value="otc">Over the counter</option><option value="prescription">Prescription</option><option value="controlled">Controlled drug</option></select></Field>
            <Field label="GTIN (barcode)" hint="Scan the box into this field. 8, 12, 13 or 14 digits; the check digit is verified."><input name="gtin" className={inputClass} inputMode="numeric" /></Field>
            <Field label="Reorder level"><input name="reorderLevel" inputMode="numeric" defaultValue={0} className={inputClass} /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
