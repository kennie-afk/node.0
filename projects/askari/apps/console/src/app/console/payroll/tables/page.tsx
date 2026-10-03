import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { dayTime } from "@/lib/format";
import type { Holiday, RateTable } from "@/lib/types";
import { addHoliday, confirmTable, loadIllustrative, removeHoliday, saveTable } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Field, Notice, PageHeader, inputClass, secondaryButtonClass, textareaClass } from "@/components/ui";

const TITLE: Record<string, string> = { nssf: "NSSF", sha: "SHA", housing: "Housing levy", paye: "PAYE" };
const num = (c: Record<string, unknown>, k: string) => (typeof c[k] === "number" ? (c[k] as number) : null);

export default async function TablesPage() {
  const session = (await readSession())!;
  if (!can(session.role, "salary_view")) redirect("/console");
  const [tables, holidays] = await Promise.all([api.get<RateTable[]>("/v1/payroll/tables"), api.get<Holiday[]>("/v1/holidays")]);
  const write = can(session.role, "rates_write");
  return (
    <>
      <PageHeader title="Deduction tables and holidays" subtitle="Your own figures, confirmed by a named person." />
      <div className="mb-5"><Notice tone="danger"><strong>Not verified.</strong> Askari states no statutory rate as fact. Enter the figures from the current NSSF, SHA, housing-levy and KRA schedules yourself (or load the illustrative set and change it), check them against the official source, and confirm each table with a note. Until a table is confirmed nothing is deducted for it and a month cannot be closed. Changing a confirmed table un-confirms it.</Notice></div>
      <div className="grid gap-5 lg:grid-cols-2">
        {tables.map((t) => {
          const c = t.config;
          return (
            <Card key={t.kind} title={TITLE[t.kind]!} actions={<Badge value={t.status} />} description={t.source === "illustrative_unverified" ? "Loaded from Askari's illustrative starter set: UNVERIFIED." : t.source === "firm_entered" ? "Entered by your firm." : "Nothing entered."}>
              {t.status === "confirmed" || t.status === "not_applicable" ? <p className="mb-3 text-[0.75rem] text-[var(--color-muted)]">{t.status === "confirmed" ? "Confirmed" : "Marked not applicable"} by {t.confirmedBy} on {t.confirmedAt ? dayTime(t.confirmedAt) : ""}: {t.note}</p> : null}
              {write ? (
                <ActionForm action={saveTable} submit="Save figures" className="flex flex-col gap-2">
                  <input type="hidden" name="kind" value={t.kind} />
                  {t.kind === "nssf" ? <><div className="grid grid-cols-2 gap-2"><Field label="Employee %"><input name="employeeRate" type="number" step="0.01" min={0} defaultValue={num(c, "employeeRateBp") !== null ? num(c, "employeeRateBp")! / 100 : ""} className={inputClass} /></Field><Field label="Employer %"><input name="employerRate" type="number" step="0.01" min={0} defaultValue={num(c, "employerRateBp") !== null ? num(c, "employerRateBp")! / 100 : ""} className={inputClass} /></Field></div><Field label="Upper earnings limit (KES)" hint="Blank = no limit."><input name="upperLimit" type="number" step="0.01" defaultValue={num(c, "upperLimitCents") !== null ? num(c, "upperLimitCents")! / 100 : ""} className={inputClass} /></Field></> : null}
                  {t.kind === "sha" ? <><div className="grid grid-cols-2 gap-2"><Field label="Employee %"><input name="employeeRate" type="number" step="0.01" min={0} defaultValue={num(c, "employeeRateBp") !== null ? num(c, "employeeRateBp")! / 100 : ""} className={inputClass} /></Field><Field label="Employer %"><input name="employerRate" type="number" step="0.01" min={0} defaultValue={num(c, "employerRateBp") !== null ? num(c, "employerRateBp")! / 100 : ""} className={inputClass} /></Field></div><div className="grid grid-cols-2 gap-2"><Field label="Minimum (KES)"><input name="min" type="number" step="0.01" defaultValue={num(c, "minCents") !== null ? num(c, "minCents")! / 100 : ""} className={inputClass} /></Field><Field label="Maximum (KES)" hint="Blank = none."><input name="max" type="number" step="0.01" defaultValue={num(c, "maxCents") !== null ? num(c, "maxCents")! / 100 : ""} className={inputClass} /></Field></div></> : null}
                  {t.kind === "housing" ? <div className="grid grid-cols-2 gap-2"><Field label="Employee %"><input name="employeeRate" type="number" step="0.01" min={0} defaultValue={num(c, "employeeRateBp") !== null ? num(c, "employeeRateBp")! / 100 : ""} className={inputClass} /></Field><Field label="Employer %"><input name="employerRate" type="number" step="0.01" min={0} defaultValue={num(c, "employerRateBp") !== null ? num(c, "employerRateBp")! / 100 : ""} className={inputClass} /></Field></div> : null}
                  {t.kind === "paye" ? (
                    <>
                      <Field label="Tax bands" hint='One per line: "upper limit in KES, rate %". The last line has no limit: write "rest,35".'><textarea name="bands" className={`${textareaClass} font-mono`} defaultValue={Array.isArray(c.bands) ? (c.bands as { upToCents: number | null; rateBp: number }[]).map((b) => `${b.upToCents === null ? "rest" : b.upToCents / 100},${b.rateBp / 100}`).join("\n") : ""} /></Field>
                      <Field label="Monthly personal relief (KES)"><input name="relief" type="number" step="0.01" min={0} defaultValue={num(c, "personalReliefCents") !== null ? num(c, "personalReliefCents")! / 100 : ""} className={inputClass} /></Field>
                      <fieldset className="text-[0.75rem]"><legend className="mb-1 text-[var(--color-muted)]">Taken off gross before tax</legend><div className="flex gap-3">{["nssf", "sha", "housing"].map((k) => <label key={k} className="flex items-center gap-1"><input type="checkbox" name="taxable" value={k} defaultChecked={Array.isArray(c.taxableDeducts) && (c.taxableDeducts as string[]).includes(k)} />{TITLE[k]}</label>)}</div></fieldset>
                    </>
                  ) : null}
                </ActionForm>
              ) : null}
              {write ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-[var(--color-line)] pt-3">
                  <ActionForm action={loadIllustrative} submit="Load the illustrative set (unverified)" button={secondaryButtonClass}><input type="hidden" name="kind" value={t.kind} /></ActionForm>
                  <ActionForm action={confirmTable} submit="Confirm with my name" className="flex flex-col gap-2"><input type="hidden" name="kind" value={t.kind} /><Field label="What did you check it against?"><input name="note" required minLength={5} className={inputClass} placeholder="e.g. the NSSF schedule dated 1 Feb 2026" /></Field></ActionForm>
                  <ActionForm action={confirmTable} submit="This does not apply to us" button={secondaryButtonClass} className="flex flex-col gap-2"><input type="hidden" name="kind" value={t.kind} /><input type="hidden" name="mode" value="na" /><Field label="Why not?"><input name="note" required minLength={5} className={inputClass} /></Field></ActionForm>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
      <div className="mt-5"><Card title="Public holidays" description="Typed by you; Askari ships no calendar, because dates move and a wrong date would mis-pay guards. A guard's shift on one of these days earns the holiday multiplier you set.">
        <ul className="mb-3 divide-y divide-[var(--color-line)] text-[0.8125rem]">{holidays.map((h) => <li key={h.day} className="flex items-center justify-between py-1.5"><span>{h.day} · {h.name}</span>{write ? <ActionForm action={removeHoliday} submit="Remove" button={secondaryButtonClass}><input type="hidden" name="day" value={h.day} /></ActionForm> : null}</li>)}</ul>
        {write ? <ActionForm action={addHoliday} submit="Add holiday" className="flex flex-wrap items-end gap-2"><Field label="Date"><input name="day" type="date" required className={inputClass} /></Field><Field label="Name"><input name="name" required minLength={2} className={inputClass} /></Field></ActionForm> : null}
      </Card></div>
     
    </>
  );
}
