import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { bq } from "@/lib/branch";
import { can } from "@/lib/roles";
import { ksh, WEEKDAYS } from "@/lib/format";
import { link, pageOf, sp, type SearchParams } from "@/lib/query";
import type { Guard, Page } from "@/lib/types";
import { addGuard } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Download, EmptyState, Field, PageHeader, Paging, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

export default async function GuardsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  const page = pageOf(q);
  const list = await api.get<Page<Guard>>(`/v1/guards?page=${page}&pageSize=25${q.q ? `&q=${encodeURIComponent(q.q)}` : ""}${q.status ? `&status=${q.status}` : ""}${await bq("&")}`);
  const pay = can(session.role, "salary_view");
  return (
    <>
      <PageHeader title="Guards" subtitle="The people you employ. PSRA, NSSF, SHA and KRA numbers are kept exactly as you type them; Sojaa cannot verify any of them." actions={<Download href="/files/exports/guards.csv">Download all</Download>} />
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <Field label="Search"><input name="q" defaultValue={q.q ?? ""} placeholder="Name, number, ID or phone" className={inputClass} /></Field>
        <Field label="Show"><select name="status" defaultValue={q.status ?? ""} className={selectClass}><option value="">Everyone</option><option value="active">Active</option><option value="exited">Left</option></select></Field>
        <button className={secondaryButtonClass} type="submit">Search</button>
      </form>
      <div className={`grid gap-5 ${can(session.role, "guards_write") ? "lg:grid-cols-[1.7fr_1fr]" : ""}`}>
        <Card>
          {list.items.length === 0 ? <EmptyState message="No guards match." detail="Add your first guard on the right." /> : (
            <Table head={["Guard", "Branch", "Registration (as typed)", ...(pay ? ["Basic pay"] : []), "Status"]}>
              {list.items.map((g) => (
                <tr key={g.id} className={rowClass}>
                  <td className={cell}><Link href={`/console/guards/${g.id}`} className="font-medium underline-offset-2 hover:underline">{g.fullName}</Link><div className="text-[0.6875rem] text-[var(--color-faint)]">{g.guardNo}{g.phone ? ` · ${g.phone}` : ""}</div></td>
                  <td className={cell}>{g.branch}</td>
                  <td className={cell}>{g.psraRegNo ?? <span className="text-[var(--color-warn)]">none recorded</span>}{g.psraExpiry ? <div className="text-[0.6875rem] text-[var(--color-faint)]">expires {g.psraExpiry}</div> : null}</td>
                  {pay ? <td className={`${cell} tabular-nums`}>{g.monthlyBasicCents ? ksh(g.monthlyBasicCents) : <span className="text-[var(--color-warn)]">not set</span>}</td> : null}
                  <td className={cell}><Badge value={g.status} /></td>
                </tr>
              ))}
            </Table>
          )}
          <Paging page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => link("/console/guards", q, { page: p })} />
        </Card>
        {can(session.role, "guards_write") ? (
          <Card title="Add a guard">
            <ActionForm action={addGuard} submit="Add guard">
              <Field label="Full name"><input name="fullName" required minLength={2} className={inputClass} /></Field>
              <Field label="Phone" hint="Needed for the guard to check in from their own phone."><input name="phone" className={inputClass} placeholder="0712 345 678" /></Field>
              <Field label="National ID number"><input name="nationalId" className={inputClass} /></Field>
              <Field label="PSRA registration number" hint="As the guard's card shows it. Not verified by Sojaa."><input name="psraRegNo" className={inputClass} /></Field>
              <Field label="PSRA expiry"><input name="psraExpiry" type="date" className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="NSSF no."><input name="nssfNo" className={inputClass} /></Field><Field label="SHA no."><input name="shaNo" className={inputClass} /></Field></div>
              <Field label="KRA PIN"><input name="kraPin" className={inputClass} /></Field>
              <Field label="Weekly rest day"><select name="restWeekday" className={selectClass} defaultValue=""><option value="">None recorded</option>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
              <Field label="Hired on" hint="Today if blank."><input name="hiredOn" type="date" className={inputClass} /></Field>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
