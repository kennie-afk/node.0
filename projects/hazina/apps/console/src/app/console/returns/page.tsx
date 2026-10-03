import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { addReturnTemplate, generateReturn } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { ReturnRow, ReturnTemplate } from "@/lib/types";
import { Card, EmptyState, Field, Notice, PageHeader, Table, cell, inputClass, rowClass, selectClass, textareaClass } from "@/components/ui";
import { day, dayTime, today } from "@/lib/format";

export default async function Returns() {
  const role = (await readSession())?.role ?? "";
  const [templates, returns] = await Promise.all([api.get<ReturnTemplate[]>("/v1/returns/templates"), api.get<ReturnRow[]>("/v1/returns?limit=50")]);
  const year = today().slice(0, 4);
  return (
    <>
      <PageHeader title="Returns" subtitle="Periodic summaries generated from your own ledger and loan book." />
      <div className="mb-5"><Notice tone="warn"><strong>These are not regulator returns.</strong> Hazina does not file with SASRA, the Central Bank or anyone else, and none of these templates is in a regulator&apos;s format. They are your own organisation&apos;s configuration: a generic summary you can read, check against the ledger, and use as a working paper. Prepare and submit what your regulator requires yourself.</Notice></div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card title="Generated returns">
            {returns.length === 0 ? <EmptyState message="None generated yet." detail="Choose a template and a period on the right." /> : (
              <Table head={["Return", "Period", "Generated"]}>
                {returns.map((r) => <tr key={r.id} className={rowClass}><td className={cell}><Link href={`/console/returns/${r.id}`} className="font-medium text-[var(--color-accent)] underline">{r.name}</Link> <span className="text-[0.6875rem] text-[var(--color-faint)]">v{r.version}</span></td><td className={cell}>{day(r.periodStart)} – {day(r.periodEnd)}</td><td className={`${cell} text-[var(--color-muted)]`}>{dayTime(r.createdAt)}</td></tr>)}
              </Table>
            )}
          </Card>
          <Card title="Templates">
            <Table head={["Code", "Name", "Version"]}>
              {templates.map((t) => <tr key={t.id} className={rowClass}><td className={`${cell} font-mono text-[0.75rem]`}>{t.code}</td><td className={cell}>{t.name}</td><td className={`${cell} text-[var(--color-muted)]`}>v{t.version} · own template</td></tr>)}
            </Table>
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card title="Generate a return">
            <ActionForm action={generateReturn} submit="Generate">
              <Field label="Template"><select name="templateId" className={selectClass}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="From"><input name="from" type="date" required defaultValue={`${year}-01-01`} className={inputClass} /></Field><Field label="To"><input name="to" type="date" required defaultValue={today()} max={today()} className={inputClass} /></Field></div>
            </ActionForm>
          </Card>
          {can(role, "settings") ? (
            <Card title="Add or revise a template" description="Paste a definition as JSON (title, sections, rows with a measure and a format). A revision under an existing code becomes the next version; earlier versions stay for the returns already made with them.">
              <ActionForm action={addReturnTemplate} submit="Save template" button="inline-flex items-center rounded-lg border border-[var(--color-line)] px-3.5 py-2 text-[0.8125rem] font-medium">
                <Field label="Code"><input name="code" required pattern="[A-Z0-9-]{3,40}" placeholder="MY-QUARTERLY" className={inputClass} /></Field>
                <Field label="Name"><input name="name" required className={inputClass} /></Field>
                <Field label="Definition (JSON)"><textarea name="definition" required className={`${textareaClass} font-mono text-[0.75rem]`} placeholder='{"title":"...","sections":[{"title":"...","rows":[{"label":"Active members","measure":{"kind":"members_count","status":"active"},"format":"count"}]}]}' /></Field>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
