import { api } from "@/lib/api";
import type { NttsEvent, NttsStatus } from "@/lib/types";
import { Badge, Card, EmptyState, Notice, PageHeader, Stat, Table, rowClass, secondaryButtonClass } from "@/components/ui";
import { dayTime } from "@/lib/format";

export default async function Trace() {
  const [status, events] = await Promise.all([api.get<NttsStatus>("/v1/ntts/status"), api.get<NttsEvent[]>("/v1/ntts/events?limit=100").catch(() => [] as NttsEvent[])]);
  return (
    <>
      <PageHeader title="Trace log" subtitle="What a medicine track-and-trace report would contain, recorded as it happens." actions={<a href="/console/trace/export" className={secondaryButtonClass}>Download CSV</a>} />
      <div className="mb-5"><Notice tone="warn"><strong>Not connected to the national platforms.</strong> {status.notice}</Notice></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><Stat label="Events recorded" value={String(status.pendingEvents)} hint="nothing has been sent anywhere" tone="accent" /><Stat label="Integration" value={status.integrated ? "Connected" : "Not connected"} tone={status.integrated ? "good" : "warn"} /><Stat label="Oldest event" value={status.oldestPending ?? "—"} tone="accent" /></div>
      <div className="mt-5">
        <Card title="Latest events">
          {events.length === 0 ? <EmptyState message="Nothing yet. Receiving and selling stock fills this in." /> : (
            <Table head={["When", "Event", "GTIN", "Batch", "Expiry", "Serial", "Qty"]}>
              {events.map((e) => (
                <tr key={e.id} className={rowClass}>
                  <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{dayTime(e.occurredAt)}</td><td className="px-3.5 py-2.5"><Badge value={e.eventType === "receipt" ? "receive" : e.eventType === "dispense" ? "dispense" : e.eventType} /></td>
                  <td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{e.gtin ?? "—"}</td><td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{e.batchNo ?? "—"}</td><td className="px-3.5 py-2.5">{e.expiryDate ?? "—"}</td><td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{e.serial ?? "—"}</td><td className="px-3.5 py-2.5 tabular-nums">{e.qty}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
