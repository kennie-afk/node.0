import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import type { LoanPage } from "@/lib/types";
import { Badge, Card, Download, EmptyState, Field, PageHeader, Pager, Table, buttonClass, cell, inputClass, num, rowClass, secondaryButtonClass } from "@/components/ui";
import { bp, day, ksh } from "@/lib/format";

const STATUSES = ["", "applied", "appraised", "approved", "disbursed", "closed", "rejected", "written_off", "restructured"];

export default async function Loans({ searchParams }: { searchParams: Promise<{ status?: string; search?: string; after?: string }> }) {
  const { status, search, after } = await searchParams;
  const role = (await readSession())?.role ?? "";
  const q = new URLSearchParams({ limit: "25" });
  if (status) q.set("status", status);
  if (search) q.set("search", search);
  if (after) q.set("after", after);
  const page = await api.get<LoanPage>(`/v1/loans?${q}`);
  const keep = new URLSearchParams(); if (status) keep.set("status", status); if (search) keep.set("search", search);
  const next = new URLSearchParams(keep); if (page.nextCursor) next.set("after", page.nextCursor);

  return (
    <>
      <PageHeader title="Loans" subtitle="Apply, appraise, approve and pay out are four steps for at least two people. The schedule is fixed when the money goes out." actions={<>
        {can(role, "products_write") ? <Link href="/console/loans/products" className={secondaryButtonClass}>Loan products</Link> : <Link href="/console/loans/products" className={secondaryButtonClass}>Products and terms</Link>}
        {can(role, "reports") ? <Download href="/console/download/loans">Download CSV</Download> : null}
        {can(role, "loan_apply") ? <Link href="/console/loans/new" className={buttonClass}>New application</Link> : null}
      </>} />
      <Card>
        <nav className="mb-3 flex flex-wrap gap-1">
          {STATUSES.map((s) => <Link key={s || "all"} href={`/console/loans${s ? `?status=${s}` : ""}`} className={(status ?? "") === s ? "rounded-md bg-[var(--color-ink)] px-2.5 py-1 text-[0.75rem] font-medium text-white" : "rounded-md px-2.5 py-1 text-[0.75rem] font-medium text-[var(--color-muted)]"}>{s ? s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) : "All"}</Link>)}
        </nav>
        <form className="mb-4 flex items-end gap-2" action="/console/loans">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <div className="max-w-sm flex-1"><Field label="Search"><input name="search" defaultValue={search ?? ""} placeholder="Loan number, member name or number" className={inputClass} /></Field></div>
          <button type="submit" className={secondaryButtonClass}>Search</button>
        </form>
        {page.items.length === 0 ? <EmptyState message="No loans here." detail={status ? "Try another status." : undefined} /> : (
          <Table head={["Loan", "Member", "Principal", "Term", "Rate", "Applied", "Status"]}>
            {page.items.map((l) => (
              <tr key={l.id} className={rowClass}>
                <td className={`${cell} font-mono text-[0.75rem]`}><Link href={`/console/loans/${l.id}`} className="text-[var(--color-accent)] underline">{l.loanNo}</Link></td>
                <td className={cell}>{l.memberName} <span className="font-mono text-[0.6875rem] text-[var(--color-faint)]">{l.memberNo}</span></td>
                <td className={num}>{ksh(l.principalCents)}</td>
                <td className={num}>{l.termMonths} mo</td>
                <td className={num}>{bp(l.annualRateBp)} {l.method}</td>
                <td className={`${cell} text-[var(--color-muted)]`}>{day(l.createdAt)}</td>
                <td className={cell}><Badge value={l.status} /></td>
              </tr>
            ))}
          </Table>
        )}
        <Pager href={page.nextCursor ? `/console/loans?${next}` : null} />
      </Card>
    </>
  );
}
