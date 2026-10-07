import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { type Page, type Person } from "@/lib/types";
import { FilterBar, Pager, queryString, type FilterField } from "@/components/list-tools";
import { Badge, buttonClass, Card, EmptyState, Notice, PageHeader, Table, rowClass } from "@/components/ui";

const FILTER_KEYS = ["q", "role", "status", "after"] as const;
const FIELDS: FilterField[] = [
  { name: "q", label: "Name or phone", kind: "text", placeholder: "Wanjiku" },
  { name: "role", label: "Role", kind: "select", options: ["owner", "manager", "supervisor", "worker", "support"].map((value) => ({ value, label: value })) },
  { name: "status", label: "Status", kind: "select", options: [{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }] }
];

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const params = Object.fromEntries(FILTER_KEYS.map((key) => [key, query[key]]));
  const session = await readSession();
  let people: Person[] = [];
  let next: string | null = null;
  let error: string | null = null;
  try {
    const page = await api.get<Page<Person>>(`/v1/users${queryString(params)}`);
    people = page.items;
    next = page.next;
  } catch (caught) {
    error = describeError(caught);
  }
  const canOpen = session?.role === "owner" || session?.role === "manager";

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
      <FilterBar fields={FIELDS} values={params} reset="/console/team" />
      {!error && people.length === 0 ? (
        <Card>
          <EmptyState
            message={Object.values(params).some(Boolean) ? "Nobody matches" : "Nobody yet"}
            detail={Object.values(params).some(Boolean) ? "Clear the filters to see everyone." : "Add the first worker to start recording jobs."}
          />
        </Card>
      ) : (
        <Card>
          <Table head={["Name", "Phone", "Role", "Site", "Status"]}>
            {people.map((person) => (
              <tr key={person.id} className={rowClass}>
                <td className="px-3.5 py-2.5 text-[0.8125rem] font-medium">
                  {canOpen ? (
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
      <Pager base="/console/team" params={params} next={next} shown={people.length} />
    </>
  );
}
