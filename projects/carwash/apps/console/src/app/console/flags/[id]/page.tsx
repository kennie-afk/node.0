import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { ksh, type Discrepancy } from "@/lib/types";
import { ResolveForm } from "@/components/forms";
import { Badge, Card, KeyValue, Notice, PageHeader, secondaryButtonClass } from "@/components/ui";

export default async function FlagPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  let flag: Discrepancy | null = null;
  let error: string | null = null;
  try {
    flag = await api.get<Discrepancy>(`/v1/discrepancies/${id}`);
  } catch (caught) {
    error = describeError(caught);
  }

  if (!flag) {
    return (
      <>
        <PageHeader title="Flag" />
        <Notice tone="danger">{error}</Notice>
      </>
    );
  }

  const scalars = Object.entries(flag.evidence ?? {}).filter(([, value]) => typeof value !== "object");
  const lists = Object.entries(flag.evidence ?? {}).filter(([, value]) => Array.isArray(value));
  const canResolve = session?.role === "owner" || session?.role === "manager";

  return (
    <>
      <PageHeader
        title={flag.type.replaceAll("_", " ")}
        subtitle={flag.summary}
        actions={
          <Link href="/console/flags" className={secondaryButtonClass}>
            All flags
          </Link>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What we found">
          <div className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge value={flag.severity} />
              <Badge value={flag.state} />
              {flag.estimatedCents > 0 ? (
                <span className="text-[0.9375rem] font-semibold tabular-nums text-[var(--color-danger)]">{ksh(flag.estimatedCents)}</span>
              ) : null}
            </div>
            <KeyValue
              items={[
                ["Site", flag.site],
                ["Business day", String(flag.businessDay).slice(0, 10)],
                ...scalars.map(([key, value]) => [key.replaceAll("_", " "), typeof value === "number" ? String(Math.round(value * 100) / 100) : String(value)] as [string, string])
              ]}
            />
            {lists.map(([key, value]) => (
              <div key={key}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted)]">{key.replaceAll("_", " ")}</p>
                <p className="mt-1 break-all font-mono text-[0.6875rem] text-[var(--color-muted)]">{(value as unknown[]).length} record(s): {(value as unknown[]).slice(0, 4).map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ")}{(value as unknown[]).length > 4 ? "…" : ""}</p>
              </div>
            ))}
            {flag.resolutionNote ? (
              <Notice tone="info">
                {flag.resolvedBy ? `${flag.resolvedBy}: ` : ""}
                {flag.resolutionNote}
              </Notice>
            ) : null}
          </div>
        </Card>
        <Card title="Resolve" description="Say what you found. The note stays on the flag for whoever asks next.">
          <div className="px-5 pb-5">
            <ResolveForm id={flag.id} state={flag.state} canResolve={canResolve} />
          </div>
        </Card>
      </div>
    </>
  );
}
