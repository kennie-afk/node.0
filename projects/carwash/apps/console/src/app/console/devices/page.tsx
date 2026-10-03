import { api, describeError } from "@/lib/api";
import { type Device } from "@/lib/types";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, rowClass } from "@/components/ui";

const LABEL: Record<string, string> = {
  flow_meter: "Flow meter",
  pump_monitor: "Pump monitor",
  beam: "Beam sensor",
  doser: "Doser",
  machine: "Machine counter",
  camera: "Plate camera"
};

function age(value: string | null): { text: string; stale: boolean } {
  if (!value) return { text: "never", stale: true };
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 2) return { text: "just now", stale: false };
  if (minutes < 90) return { text: `${minutes} min ago`, stale: false };
  const hours = Math.round(minutes / 60);
  if (hours < 36) return { text: `${hours} h ago`, stale: hours > 12 };
  return { text: `${Math.round(hours / 24)} days ago`, stale: true };
}

export default async function DevicesPage() {
  let devices: Device[] = [];
  let error: string | null = null;
  try {
    devices = await api.get<Device[]>("/v1/devices");
  } catch (caught) {
    error = describeError(caught);
  }
  const quiet = devices.filter((device) => age(device.lastSeen).stale).length;

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="The machines that witness the work: flow meters, pump monitors, plate cameras. A device that goes quiet is a blind spot someone may have created on purpose."
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {quiet > 0 ? (
        <div className="mb-4">
          <Notice tone="warn">
            {quiet} device{quiet === 1 ? " has" : "s have"} not reported recently. Check the power and the cable before assuming it broke.
          </Notice>
        </div>
      ) : null}
      {!error && devices.length === 0 ? (
        <Card>
          <EmptyState message="No devices yet" detail="Devices register here once they are provisioned for a bay." />
        </Card>
      ) : (
        <Card>
          <Table head={["Device", "Site", "Bay", "Firmware", "Last seen", "Readings", "Status"]}>
            {devices.map((device) => {
              const seen = age(device.lastSeen);
              return (
                <tr key={device.id} className={rowClass}>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium">{LABEL[device.type] ?? device.type}</td>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] text-[var(--color-muted)]">{device.site}</td>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] text-[var(--color-muted)]">{device.bay ?? "Gate"}</td>
                  <td className="px-3.5 py-2.5 font-mono text-[0.75rem] text-[var(--color-muted)]">{device.firmware ?? "—"}</td>
                  <td className={`px-3.5 py-2.5 text-[0.8125rem] ${seen.stale ? "font-medium text-[var(--color-warn)]" : ""}`}>{seen.text}</td>
                  <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{device.lastSequence.toLocaleString()}</td>
                  <td className="px-3.5 py-2.5">
                    <Badge value={seen.stale ? "quiet" : "live"} />
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
    </>
  );
}
