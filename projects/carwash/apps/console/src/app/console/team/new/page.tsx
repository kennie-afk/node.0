import { api, describeError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { type Site } from "@/lib/types";
import { UserForm } from "@/components/forms";
import { Card, Notice, PageHeader } from "@/components/ui";

export default async function NewPersonPage() {
  const session = await readSession();
  let sites: Site[] = [];
  let error: string | null = null;
  try {
    sites = await api.get<Site[]>("/v1/sites");
  } catch (caught) {
    error = describeError(caught);
  }
  return (
    <>
      <PageHeader title="Add a person" subtitle="They sign in with their phone number and this PIN." />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {session?.role !== "owner" ? (
        <Notice tone="warn">Only an owner can add people.</Notice>
      ) : (
        <Card>
          <div className="p-5">
            <UserForm sites={sites.map((site) => ({ id: site.id, name: site.name }))} />
          </div>
        </Card>
      )}
    </>
  );
}
