import { readSession } from "@/lib/session";
import { SiteForm } from "@/components/forms";
import { Card, Notice, PageHeader } from "@/components/ui";

export default async function NewSitePage() {
  const session = await readSession();
  return (
    <>
      <PageHeader title="Add a site" subtitle="A site is one wash with its own till, bays and baseline." />
      {session?.role !== "owner" ? (
        <Notice tone="warn">Only an owner can add a site.</Notice>
      ) : (
        <Card>
          <div className="p-5">
            <SiteForm />
          </div>
        </Card>
      )}
    </>
  );
}

