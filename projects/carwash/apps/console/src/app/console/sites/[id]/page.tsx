import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { type SiteDetail } from "@/lib/types";
import { AddBayForm, BayRow, SiteForm } from "@/components/forms";
import { Card, Notice, PageHeader, secondaryButtonClass } from "@/components/ui";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  let site: SiteDetail | null = null;
  let error: string | null = null;

  try {
    site = await api.get<SiteDetail>(`/v1/sites/${id}`);
  } catch (caught) {
    error = describeError(caught);
  }

  if (!site) {
    return (
      <>
        <PageHeader title="Site" />
        <Notice tone="danger">{error}</Notice>
      </>
    );
  }

  const owner = session?.role === "owner";

  return (
    <>
      <PageHeader
        title={site.name}
        subtitle="The baseline the reconciliation judges this site against, and the bays it runs."
        actions={
          <Link href={`/console/flags?siteId=${site.id}`} className={secondaryButtonClass}>
            Flags for this site
          </Link>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Details">
          <div className="p-5 pt-2">
            {owner ? <SiteForm site={site} /> : <Notice>Only an owner can change a site.</Notice>}
          </div>
        </Card>
        <Card title="Bays" description="Each bay normally has its own flow meter.">
          <div className="px-5 pb-5">
            <ul>
              {site.bays.map((bay) => (
                <BayRow key={bay.id} siteId={site.id} bay={bay} />
              ))}
            </ul>
            {owner ? <AddBayForm siteId={site.id} /> : null}
          </div>
        </Card>
      </div>
    </>
  );
}
