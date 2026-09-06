import { api, describeError } from "@/lib/api";
import { type Site } from "@/lib/types";
import { Card, EmptyState, Notice, PageHeader, Table, rowClass } from "@/components/ui";

export default async function SitesPage() {
  let sites: Site[] = [];
  let error: string | null = null;

  try {
    sites = await api.get<Site[]>("/v1/sites");
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle="Each site keeps its own baseline: how much water a wash takes there, and how much of its takings are normally cash."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {!error && sites.length === 0 ? (
        <Card>
          <EmptyState message="No sites yet" detail="Add a site to start reconciling it." />
        </Card>
      ) : (
        <Card>
          <Table head={["Site", "Till", "Bays", "Jobs", "Litres per wash", "Cash baseline", "Open flags"]}>
            {sites.map((site) => (
              <tr key={site.id} className={rowClass}>
                <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium">{site.name}</td>
                <td className="px-3.5 py-2.5 font-mono text-[0.75rem] text-[var(--color-muted)]">
                  {site.tillNumber ?? "—"}
                </td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{site.bays}</td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{site.jobs}</td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{site.litresPerWash}</td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">
                  {(site.cashRatio * 100).toFixed(0)}%
                </td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">
                  {site.openFlags > 0 ? (
                    <span className="font-medium text-[var(--color-warn)]">{site.openFlags}</span>
                  ) : (
                    "0"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
