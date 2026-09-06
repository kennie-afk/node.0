import { api, describeError } from "@/lib/api";
import { type TelemetryPoint } from "@/lib/types";
import { Card, EmptyState, Meter, Notice, PageHeader, Stat } from "@/components/ui";

const LABEL: Record<string, string> = {
  water_litres: "Water",
  pump_seconds: "Pump runtime",
  machine_cycles: "Machine cycles",
  vehicle_count: "Vehicles"
};

export default async function TelemetryPage() {
  let points: TelemetryPoint[] = [];
  let error: string | null = null;

  try {
    points = await api.get<TelemetryPoint[]>("/v1/telemetry");
  } catch (caught) {
    error = describeError(caught);
  }

  const water = points.filter((point) => point.metric === "water_litres");
  const litres = water.reduce((sum, point) => sum + point.total, 0);
  const peak = Math.max(1, ...water.map((point) => point.total));

  return (
    <>
      <PageHeader
        title="Water"
        subtitle="You cannot wash a car without water. A flow meter costs a fraction of a camera and produces a number no worker can argue with."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {water.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Total litres" value={litres.toFixed(0)} hint="across the window held" />
          <Stat
            label="Implied washes"
            value={String(Math.floor(litres / 60))}
            hint="at 60 litres a wash"
          />
          <Stat label="Hours reporting" value={String(water.length)} />
        </div>
      ) : null}

      {!error && water.length === 0 ? (
        <Card>
          <EmptyState
            message="No telemetry yet"
            detail="Devices report per-minute totals rather than raw ticks, which is what keeps the volume survivable."
          />
        </Card>
      ) : (
        <Card title="Water by hour" description="Compare this against the jobs recorded in the same hours.">
          <ul className="space-y-3">
            {water.slice(0, 14).map((point) => (
              <li key={`${point.hour}-${point.metric}`}>
                <div className="mb-1 flex items-baseline justify-between gap-4">
                  <span className="text-[0.75rem] text-[var(--color-muted)]">
                    {new Date(point.hour).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit"
                    })}
                  </span>
                  <span className="text-[0.75rem] tabular-nums">
                    {point.total.toFixed(0)} L · {Math.floor(point.total / 60)} washes
                  </span>
                </div>
                <Meter value={point.total / peak} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-faint)]">
        A gap in a device's sequence numbers is itself a fraud signal, because unplugging the
        sensor is the obvious counter-move to being measured by it.
      </p>
    </>
  );
}
