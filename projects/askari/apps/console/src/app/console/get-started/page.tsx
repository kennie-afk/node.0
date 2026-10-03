import { api } from "@/lib/api";
import type { Onboarding } from "@/lib/types";
import { Badge, Card, Meter, PageHeader } from "@/components/ui";

export default async function GetStarted() {
  const o = await api.get<Onboarding>("/v1/onboarding");
  return (
    <>
      <PageHeader title="Get started" subtitle="What a new firm does first, read from your own records. Each step ticks itself." />
      <div className="max-w-2xl"><Card title={`${o.doneCount} of ${o.total} done`}>
        <Meter value={o.doneCount / o.total} tone="good" />
        <ol className="mt-4 flex flex-col gap-3">{o.items.map((i, n) => (
          <li key={i.key} className="flex gap-3 rounded-lg border border-[var(--color-line)] p-3" data-done={i.done}>
            <span className="mt-0.5 text-[0.75rem] text-[var(--color-faint)]">{n + 1}</span>
            <div><div className="flex items-center gap-2 text-[0.875rem] font-medium">{i.title}{i.done ? <Badge value="completed" /> : null}</div><p className="mt-1 text-[0.8125rem] text-[var(--color-muted)]">{i.hint}</p></div>
          </li>
        ))}</ol>
      </Card></div>
    </>
  );
}
