import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { type Person } from "@/lib/types";
import { Badge, buttonClass, Card, EmptyState, Notice, PageHeader, Table, rowClass } from "@/components/ui";

export default async function TeamPage() {
  const session = await readSession();
  let people: Person[] = [];
  let error: string | null = null;
  try {
    people = await api.get<Person[]>("/v1/users");
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Everyone who can sign in, the site they work at, and what they are allowed to do. Workers record jobs; managers resolve flags; owners run the business."
        actions={
          session?.role === "owner" ? (
            <Link href="/console/team/new" className={buttonClass}>
              Add person
            </Link>
          ) : undefined
        }
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!error && people.length === 0 ? (
        <Card>
          <EmptyState message="Nobody yet" detail="Add the first worker to start recording jobs." />
        </Card>
      ) : (
        <Card>
          <Table head={["Name", "Phone", "Role", "Site", "Status"]}>
            {people.map((person) => (
              <tr key={person.id} className={rowClass}>
                <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium">
                  {session?.role === "owner" ? (
                    <Link href={`/console/team/${person.id}`} className="underline-offset-2 hover:underline">
                      {person.displayName}
                    </Link>
                  ) : (
                    person.displayName
                  )}
                </td>
                <td className="px-3.5 py-2.5 font-mono text-[0.75rem] text-[var(--color-muted)]">{person.phone}</td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] capitalize">{person.role}</td>
                <td className="px-3.5 py-2.5 text-[0.8125rem] text-[var(--color-muted)]">{person.site ?? "All sites"}</td>
                <td className="px-3.5 py-2.5">
                  <Badge value={person.status} />
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
