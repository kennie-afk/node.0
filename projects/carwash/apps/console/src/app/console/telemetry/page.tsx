import { api, describeError } from "@/lib/api";
import { type Site, type TelemetryPoint } from "@/lib/types";
import { FilterBar, type FilterField } from "@/components/list-tools";
import { Card, EmptyState, Meter, Notice, PageHeader, Stat } from "@/components/ui";

const LABEL: Record<string, string> = {
  water_litres: "Water",
  pump_seconds: "Pump runtime",
  machine_cycles: "Machine cycles",
  vehicle_count: "Vehicles"
};

const WINDOWS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" }
];

export default async function TelemetryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const days = WINDOWS.some((item) => item.value === query.days) ? (query.days as string) : "7";
  const siteId = query.siteId ?? "";
  let points: TelemetryPoint[] = [];
  let sites: Site[] = [];
  let error: string | null = null;

  try {
    [sites, points] = await Promise.all([
      api.get<Site[]>("/v1/sites"),
      api.get<TelemetryPoint[]>(`/v1/telemetry?days=${days}&limit=200${siteId ? `&siteId=${siteId}` : ""}`)
    ]);
  } catch (caught) {
    error = describeError(caught);
  }

  const fields: FilterField[] = [
    ...(sites.length > 1 ? [{ name: "siteId", label: "Site", kind: "select" as const, options: sites.map((site) => ({ value: site.id, label: site.name })) }] : []),
    { name: "days", label: "Window", kind: "select", options: WINDOWS }
  ];
  const siteName = sites.find((site) => site.id === siteId)?.name;
  const litresPerWash = (siteId ? sites.find((site) => site.id === siteId)?.litresPerWash : sites[0]?.litresPerWash) ?? 60;

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

      <FilterBar fields={fields} values={{ siteId, days }} reset="/console/telemetry" />

      {water.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Total litres" value={Math.round(litres).toLocaleString("en-KE")} hint={siteName ? `${siteName}, last ${days} days` : `all sites, last ${days} days`} />
          <Stat
            label="Implied washes"
            value={String(Math.floor(litres / litresPerWash))}
            hint={`at ${litresPerWash} litres a wash`}
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
        <Card title="Water by hour" description="The latest 48 hours with readings. Compare this against the jobs recorded in the same hours.">
          <ul className="space-y-3">
            {water.slice(0, 48).map((point) => (
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
                    {point.total.toFixed(0)} L · {Math.floor(point.total / litresPerWash)} washes
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
