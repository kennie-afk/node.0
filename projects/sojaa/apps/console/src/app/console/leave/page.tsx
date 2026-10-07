import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { link, pageOf, sp, type SearchParams } from "@/lib/query";
import type { Page, Guard, LeaveRow } from "@/lib/types";
import { cancelLeave, decideLeave, requestLeave } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Field, Notice, PageHeader, Paging, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

export default async function LeavePage({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  const canRequest = can(session.role, "leave_write");
  const canDecide = can(session.role, "leave_approve");
  const page = pageOf(q);
  const [rows, guards] = await Promise.all([
    api.get<Page<LeaveRow>>(`/v1/leave?pageSize=25&page=${page}${q.status ? `&status=${encodeURIComponent(q.status)}` : ""}`),
    canRequest ? api.get<Page<Guard>>(`/v1/guards?status=active&pageSize=100${q.guard ? `&q=${encodeURIComponent(q.guard)}` : ""}`) : Promise.resolve(null)
  ]);
  return (
    <>
      <PageHeader title="Leave" subtitle="Annual, sick and unpaid leave, asked for and approved by someone with the right. Days are calendar days." />
      <div className="mb-5"><Notice>Leave only changes pay if you have switched on the absence deduction in Settings. Annual entitlement is your own setting, not a statement of the law.</Notice></div>
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card title={`${rows.total} request${rows.total === 1 ? "" : "s"}`}>
          <form className="mb-3 flex items-center gap-2 text-[0.8125rem]">
            <select name="status" defaultValue={q.status ?? ""} className={selectClass}><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Refused</option><option value="cancelled">Cancelled</option></select>
            <button className={secondaryButtonClass}>Filter</button>
          </form>
          {rows.items.length === 0 ? <EmptyState message="No leave requests" detail="Requests appear here." /> : (
            <Table head={["Guard", "Kind", "From", "To", "Days", "Status", ""]}>
              {rows.items.map((r) => (
                <tr key={r.id} className={rowClass}>
                  <td className={cell}>{r.guard} <span className="text-[var(--color-muted)]">{r.guardNo}</span></td>
                  <td className={cell}>{r.kind}</td><td className={cell}>{r.startDay}</td><td className={cell}>{r.endDay}</td><td className={cell}>{r.days}</td>
                  <td className={cell}><Badge value={r.status} /></td>
                  <td className={cell}>
                    {r.status === "pending" && canDecide ? (
                      <div className="flex gap-2">
                        <ActionForm action={decideLeave} submit="Approve" className="flex" button={secondaryButtonClass}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="approve" /></ActionForm>
                        <ActionForm action={decideLeave} submit="Refuse" className="flex items-center gap-1" button={secondaryButtonClass}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="reject" /><input name="note" required placeholder="Why" className={inputClass} /></ActionForm>
                      </div>
                    ) : null}
                    {(r.status === "pending" || (r.status === "approved" && canDecide)) && canRequest ? <ActionForm action={cancelLeave} submit="Cancel" className="flex" button={secondaryButtonClass}><input type="hidden" name="id" value={r.id} /></ActionForm> : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <Paging page={rows.page} pageSize={rows.pageSize} total={rows.total} href={(p) => link("/console/leave", q, { page: p })} />
        </Card>
        {canRequest && guards ? (
          <Card title="Request leave">
            <ActionForm action={requestLeave} submit="Request">
              <Field label="Guard"><select name="guardId" required className={selectClass}>{guards.items.map((g) => <option key={g.id} value={g.id}>{g.fullName} ({g.guardNo})</option>)}</select></Field>
              <Field label="Kind"><select name="kind" className={selectClass}><option value="annual">Annual</option><option value="sick">Sick</option><option value="unpaid">Unpaid</option></select></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="From"><input type="date" name="startDay" required className={inputClass} /></Field><Field label="To (last day)"><input type="date" name="endDay" className={inputClass} /></Field></div>
              <Field label="Reason"><input name="reason" className={inputClass} /></Field>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
