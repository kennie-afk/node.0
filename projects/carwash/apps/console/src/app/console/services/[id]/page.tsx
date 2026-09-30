import { api, describeError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { type Service } from "@/lib/types";
import { ServiceForm } from "@/components/forms";
import { Card, Notice, PageHeader } from "@/components/ui";

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  let service: Service | undefined;
  let error: string | null = null;
  try {
    service = (await api.get<Service[]>("/v1/services")).find((candidate) => candidate.id === id);
    if (!service) error = "That service was not found.";
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader title={service?.name ?? "Service"} subtitle="Change the price, the expectation, or switch it off." />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {service ? (
        session?.role === "owner" ? (
          <Card>
            <div className="p-5">
              <ServiceForm service={service} />
            </div>
          </Card>
        ) : (
          <Notice>Only an owner can change the price list.</Notice>
        )
      ) : null}
    </>
  );
}
