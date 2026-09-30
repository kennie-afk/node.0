import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { ksh, type Service } from "@/lib/types";
import { Badge, buttonClass, Card, EmptyState, Notice, PageHeader, Table, rowClass } from "@/components/ui";

export default async function ServicesPage() {
  const session = await readSession();
  let services: Service[] = [];
  let error: string | null = null;
  try {
    services = await api.get<Service[]>("/v1/services");
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader
        title="Prices"
        subtitle="The price list every job is quoted from. Anything charged below these prices without a manager's authorisation is flagged."
        actions={
          session?.role === "owner" ? (
            <Link href="/console/services/new" className={buttonClass}>
              Add service
            </Link>
          ) : undefined
        }
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!error && services.length === 0 ? (
        <Card>
          <EmptyState message="No services yet" detail="Add a wash to start quoting jobs." />
        </Card>
      ) : (
        <Card>
          <Table head={["Service", "Price", "Water", "Duration", "Commission", "Sold", "Status"]}>
            {services.map((service) => (
              <tr key={service.id} className={rowClass}>
                <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium">
                  <Link href={`/console/services/${service.id}`} className="underline-offset-2 hover:underline">
                    {service.name}
                  </Link>
                </td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{ksh(service.listPriceCents)}</td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{service.expectedWaterL} L</td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{Math.round(service.expectedDurationS / 60)} min</td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{Math.round(service.commissionRate * 100)}%</td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] tabular-nums">{service.uses ?? 0}</td>
                <td className="px-3.5 py-2.5">
                  <Badge value={service.active ? "active" : "suspended"} />
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
