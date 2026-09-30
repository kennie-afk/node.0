import { api, describeError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { type Person, type Site } from "@/lib/types";
import { UserForm } from "@/components/forms";
import { Card, Notice, PageHeader } from "@/components/ui";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  let person: Person | null = null;
  let sites: Site[] = [];
  let error: string | null = null;
  try {
    person = await api.get<Person>(`/v1/users/${id}`);
    sites = await api.get<Site[]>("/v1/sites");
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader title={person?.displayName ?? "Person"} subtitle="Change their role, site or PIN, or suspend their sign-in." />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {person ? (
        session?.role === "owner" ? (
          <Card>
            <div className="p-5">
              <UserForm person={person} sites={sites.map((site) => ({ id: site.id, name: site.name }))} />
            </div>
          </Card>
        ) : (
          <Notice>Only an owner can change a person.</Notice>
        )
      ) : null}
    </>
  );
}
