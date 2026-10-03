import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { ksh, prevMonth, thisMonth, dayTime } from "@/lib/format";
import type { Period } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Table, cell, rowClass, secondaryButtonClass } from "@/components/ui";

export default async function PayrollPage() {
  const session = (await readSession())!;
  if (!can(session.role, "salary_view")) redirect("/console");
  const periods = await api.get<Period[]>("/v1/payroll/periods");
  const known = new Set(periods.map((p) => p.month));
  const suggestions = [thisMonth(), prevMonth()].filter((m) => !known.has(m));
  return (
    <>
      <PageHeader title="Payroll" subtitle="One calendar month at a time. A closed month never changes; a mistake found later is an adjustment paid in an open month." actions={can(session.role, "rates_write") ? <Link href="/console/payroll/tables" className={secondaryButtonClass}>Deduction tables</Link> : undefined} />
      <Card>
        <Table head={["Month", "Status", "Payslips", "Gross", "Net", "Closed", ""]}>
          {[...suggestions.map((m) => ({ id: m, month: m, status: "not_started" } as Period)), ...periods].sort((a, b) => b.month.localeCompare(a.month)).map((p) => (
            <tr key={p.month} className={rowClass}>
              <td className={cell}><Link href={`/console/payroll/${p.month}`} className="font-medium hover:underline">{p.month}</Link></td>
              <td className={cell}><Badge value={p.status === "closed" ? "closed" : p.status === "open" ? "open" : "not_started"} /></td>
              <td className={cell}>{p.payslips ?? "–"}</td>
              <td className={`${cell} tabular-nums`}>{p.grossCents !== undefined ? ksh(p.grossCents) : "–"}</td>
              <td className={`${cell} tabular-nums`}>{p.netCents !== undefined ? ksh(p.netCents) : "–"}</td>
              <td className={cell}>{p.closedAt ? `${dayTime(p.closedAt)} by ${p.closedBy}` : "–"}</td>
              <td className={cell}><Link href={`/console/payroll/${p.month}`} className={secondaryButtonClass}>Open</Link></td>
            </tr>
          ))}
        </Table>
        {periods.length === 0 ? <EmptyState message="No payroll run yet." detail="Open a month, set the deduction tables, and run it." /> : null}
      </Card>
    </>
  );
}
