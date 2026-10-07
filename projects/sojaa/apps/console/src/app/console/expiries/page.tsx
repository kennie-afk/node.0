import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { link, pageOf, sp, type SearchParams } from "@/lib/query";
import type { ExpiryPage } from "@/lib/types";
import { queueExpiryAlerts } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Card, EmptyState, Field, Notice, PageHeader, Paging, Table, cell, inputClass, rowClass, secondaryButtonClass } from "@/components/ui";

const KIND: Record<string, string> = { psra: "PSRA registration", training: "Training", equipment: "Equipment" };

export default async function Expiries({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  const days = Math.min(365, Math.max(0, Number(q.days) || 30));
  const data = await api.get<ExpiryPage>(`/v1/expiries?days=${days}&pageSize=25&page=${pageOf(q)}`);
  return (
    <>
      <PageHeader title="Expiries" subtitle="Registrations, training certificates and equipment that has lapsed or falls due soon." />
      <div className="mb-5"><Notice>Dates are the ones your firm typed. Sojaa checks none of them with PSRA or any issuer. Text-message alerts need an SMS provider configured by whoever runs Sojaa; until then they are only logged.</Notice></div>
      <Card title={`${data.total} item${data.total === 1 ? "" : "s"} due within ${days} days`}>
        <form className="mb-3 flex items-end gap-2 text-[0.8125rem]">
          <Field label="Look ahead (days)"><input name="days" type="number" min={0} max={365} defaultValue={days} className={inputClass} /></Field>
          <button className={secondaryButtonClass}>Show</button>
        </form>
        {data.items.length === 0 ? <EmptyState message="Nothing due" detail="Nothing has lapsed or falls due in this window." /> : (
          <Table head={["Guard", "What", "Due", "Left"]}>
            {data.items.map((i) => (
              <tr key={`${i.kind}${i.refId}`} className={rowClass}>
                <td className={cell}>{i.guard} <span className="text-[var(--color-muted)]">{i.guardNo}</span></td>
                <td className={cell}>{KIND[i.kind] ?? i.kind}: {i.label}</td>
                <td className={cell}>{i.due}</td>
                <td className={`${cell} ${i.daysLeft < 0 ? "text-[var(--color-danger)]" : ""}`}>{i.daysLeft < 0 ? `${-i.daysLeft} days overdue` : `${i.daysLeft} days`}</td>
              </tr>
            ))}
          </Table>
        )}
        <Paging page={data.page} pageSize={data.pageSize} total={data.total} href={(p) => link("/console/expiries", q, { page: p })} />
      </Card>
      {can(session.role, "guards_write") ? (
        <div className="mt-5 max-w-sm"><Card title="Text the guards">
          <ActionForm action={queueExpiryAlerts} submit="Queue and send alerts">
            <Field label="Alert for items due within (days)"><input name="days" type="number" min={0} max={365} defaultValue={days} className={inputClass} /></Field>
          </ActionForm>
        </Card></div>
      ) : null}
    </>
  );
}
