import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import type { Register } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Table, rowClass } from "@/components/ui";
import { dayTime } from "@/lib/format";

export default async function Controlled() {
  const r = await api.get<Register>(`/v1/controlled/register${await bq()}`);
  return (
    <>
      <PageHeader title="Controlled-drug register" subtitle="Every receipt, dispensing, adjustment and write-off, with a running balance and a second person's name on each. Entries cannot be changed." />
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <Card title="Balances">
          {r.balances.length === 0 ? <EmptyState message="No controlled drugs held." /> : <ul className="divide-y divide-[var(--color-line)] text-[0.8125rem]">{r.balances.map((b) => <li key={b.product_id} className="flex justify-between py-2"><span>{b.product}</span><span className="font-semibold tabular-nums">{b.balance}</span></li>)}</ul>}
        </Card>
        <Card title="Register">
          {r.entries.length === 0 ? <EmptyState message="No entries yet." /> : (
            <Table head={["When", "Drug", "Entry", "Qty", "Balance", "By / witness"]}>
              {r.entries.map((e) => (
                <tr key={e.id} className={rowClass}>
                  <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{dayTime(e.created_at)}</td>
                  <td className="px-3.5 py-2.5">{e.product}{e.patient_name ? <div className="text-[0.6875rem] text-[var(--color-faint)]">{e.patient_name}{e.prescriber ? ` · ${e.prescriber}` : ""}</div> : null}</td>
                  <td className="px-3.5 py-2.5"><Badge value={e.kind} /></td>
                  <td className={`px-3.5 py-2.5 tabular-nums ${e.qty_delta < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-good)]"}`}>{e.qty_delta > 0 ? `+${e.qty_delta}` : e.qty_delta}</td>
                  <td className="px-3.5 py-2.5 font-semibold tabular-nums">{e.balance_after}</td>
                  <td className="px-3.5 py-2.5">{e.actor}<div className="text-[0.6875rem] text-[var(--color-faint)]">witness {e.witness}</div></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
