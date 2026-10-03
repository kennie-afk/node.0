import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { addMember, importMembers } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Branch, MemberPage, Settings } from "@/lib/types";
import { Badge, Card, Download, EmptyState, Field, PageHeader, Pager, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { day } from "@/lib/format";

export default async function Members({ searchParams }: { searchParams: Promise<{ search?: string; status?: string; after?: string }> }) {
  const { search, status, after } = await searchParams;
  const session = await readSession();
  const role = session?.role ?? "";
  const q = new URLSearchParams({ limit: "25" });
  if (search) q.set("search", search);
  if (status) q.set("status", status);
  if (after) q.set("after", after);
  const [page, settings, branches] = await Promise.all([
    api.get<MemberPage>(`/v1/members?${q}`),
    api.get<Settings>("/v1/settings"),
    api.get<Branch[]>("/v1/branches").catch(() => [] as Branch[])
  ]);
  const lender = settings.organisation.kind === "lender";
  const noun = lender ? "borrower" : "member";
  const real = branches.filter((b) => !b.isSample);
  const next = new URLSearchParams(); if (search) next.set("search", search); if (status) next.set("status", status); if (page.nextCursor) next.set("after", page.nextCursor);
  const write = can(role, "members_write");

  return (
    <>
      <PageHeader title={lender ? "Borrowers" : "Members"} subtitle={`Each ${noun} has a number. It is the account number they quote when paying by M-Pesa, so it is short and never reused.`} actions={can(role, "reports") ? <Download href="/console/download/members">Download CSV</Download> : undefined} />
      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <form className="mb-4 flex flex-wrap items-end gap-2" action="/console/members">
            <div className="min-w-[200px] flex-1"><Field label="Search"><input name="search" defaultValue={search ?? ""} placeholder="Name, number, ID number or phone" className={inputClass} /></Field></div>
            <div className="w-36"><Field label="Status"><select name="status" defaultValue={status ?? ""} className={selectClass}><option value="">All</option><option value="active">Active</option><option value="dormant">Dormant</option><option value="exited">Exited</option></select></Field></div>
            <button type="submit" className={secondaryButtonClass}>Search</button>
          </form>
          {page.items.length === 0 ? <EmptyState message={search ? `No ${noun} matches that.` : `No ${noun}s yet.`} detail={write ? `Register one on the right, or import your spreadsheet.` : undefined} /> : (
            <Table head={["Number", "Name", "ID number", "Phone", "Joined", "Status"]}>
              {page.items.map((m) => (
                <tr key={m.id} className={rowClass}>
                  <td className={`${cell} font-mono text-[0.75rem]`}><Link href={`/console/members/${m.id}`} className="text-[var(--color-accent)] underline">{m.memberNo}</Link></td>
                  <td className={`${cell} font-medium`}>{m.fullName}</td>
                  <td className={`${cell} text-[var(--color-muted)]`}>{m.idNumber ?? "–"}</td>
                  <td className={`${cell} text-[var(--color-muted)]`}>{m.phone ?? "–"}</td>
                  <td className={`${cell} text-[var(--color-muted)]`}>{day(m.joinedOn)}</td>
                  <td className={cell}><Badge value={m.status} /></td>
                </tr>
              ))}
            </Table>
          )}
          <Pager href={page.nextCursor ? `/console/members?${next}` : null} />
        </Card>
        {write ? (
          <div className="flex flex-col gap-5">
            <Card title={`Register a ${noun}`}>
              <ActionForm action={addMember} submit={`Register ${noun}`}>
                <Field label="Full name"><input name="fullName" required className={inputClass} /></Field>
                <Field label="ID or passport number"><input name="idNumber" className={inputClass} /></Field>
                <Field label="Phone"><input name="phone" className={inputClass} placeholder="0712 345 678" /></Field>
                <Field label="Employer"><input name="employer" className={inputClass} /></Field>
                <Field label="Occupation"><input name="occupation" className={inputClass} /></Field>
                <Field label="Next of kin"><input name="kinName" placeholder="Name" className={inputClass} /></Field>
                <input name="kinPhone" placeholder="Next of kin phone" className={inputClass} />
                {real.length > 1 ? <Field label="Branch"><select name="branchId" className={selectClass}>{real.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field> : null}
              </ActionForm>
            </Card>
            {can(role, "journal_post") ? (
              <Card title="Import your spreadsheet" description={`A CSV with a header row. Needs a name column; id number, phone${lender ? "" : ", savings, shares and deposits (opening balances)"} are used if present. All or nothing: one bad row stops it and says which.`}>
                <ActionForm action={importMembers} submit="Import">
                  <input type="file" name="file" accept=".csv,text/csv,text/plain" required className="text-[0.8125rem]" />
                  {real.length > 1 ? <Field label="Branch"><select name="branchId" className={selectClass}>{real.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field> : null}
                </ActionForm>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
