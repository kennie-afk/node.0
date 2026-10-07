import { api } from "@/lib/api";
import { addSupplier, updateSupplierAction } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Pager } from "@/components/pager";
import type { Page, Supplier } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, inputClass } from "@/components/ui";
import { PAGE, href, whole } from "@/lib/paging";

export default async function Suppliers({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string; all?: string }> }) {
  const { q, offset: rawOffset, all } = await searchParams;
  const offset = whole(rawOffset);
  const page = await api.get<Page<Supplier>>(`/v1/suppliers?limit=${PAGE}&offset=${offset}${q ? `&search=${encodeURIComponent(q)}` : ""}${all ? "&includeInactive=true" : ""}`);
  const path = "/console/suppliers";
  return (
    <>
      <PageHeader title="Supplier details" subtitle="Names and phone numbers. A supplier you stop using can be switched off: it drops out of the lists and keeps its history." actions={
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search" className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" />{all ? <input type="hidden" name="all" value="1" /> : null}</form>} />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Suppliers" actions={<a href={href(path, { q, all: all ? undefined : 1 })} className="text-[0.75rem] font-medium text-[var(--color-accent)] underline">{all ? "Hide switched-off" : "Show switched-off"}</a>}>
          {page.items.length === 0 ? <EmptyState message={q ? "Nothing matches that search." : "No suppliers yet."} /> : (
            <>
              <div className="flex flex-col divide-y divide-[var(--color-line)]">
                {page.items.map((s) => (
                  <details key={s.id} className="py-2.5 text-[0.8125rem]">
                    <summary className="flex cursor-pointer items-center justify-between gap-3"><span className="font-medium">{s.name} {s.active ? null : <Badge value="switched off" />}</span><span className="text-[var(--color-faint)]">{s.phone ?? ""}</span></summary>
                    <ActionForm action={updateSupplierAction} submit="Save" className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                      <input type="hidden" name="id" value={s.id} />
                      <Field label="Name"><input name="name" required defaultValue={s.name} className={inputClass} /></Field>
                      <Field label="Phone"><input name="phone" defaultValue={s.phone ?? ""} className={inputClass} /></Field>
                      <label className="flex items-center gap-2 pb-2 text-[0.8125rem]"><input type="checkbox" name="active" defaultChecked={s.active} /> In use</label>
                    </ActionForm>
                  </details>
                ))}
              </div>
              <Pager from={offset} count={page.items.length} noun="suppliers" prev={offset > 0 ? href(path, { q, all, offset: Math.max(0, offset - PAGE) }) : null} next={page.hasMore ? href(path, { q, all, offset: offset + PAGE }) : null} />
            </>
          )}
        </Card>
        <Card title="Add a supplier">
          <ActionForm action={addSupplier} submit="Add supplier"><Field label="Name"><input name="name" required className={inputClass} /></Field><Field label="Phone"><input name="phone" className={inputClass} /></Field></ActionForm>
        </Card>
      </div>
    </>
  );
}
