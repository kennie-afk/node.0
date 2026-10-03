import { api } from "@/lib/api";
import { loadSample, removeSample } from "@/app/actions";
import type { Onboarding } from "@/lib/types";
import { Card, PageHeader, buttonClass, secondaryButtonClass } from "@/components/ui";

export default async function GetStarted() {
  const o = await api.get<Onboarding>("/v1/onboarding");
  return (
    <>
      <PageHeader title="Get started" subtitle="Seven steps to a pharmacy that runs on Dawa. Each one ticks itself when it is really done." />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card title={`${o.doneCount} of ${o.total} done`}>
          <ol className="flex flex-col gap-3">
            {o.items.map((i) => (
              <li key={i.key} className="flex gap-3 text-[0.8125rem]">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] ${i.done ? "border-[var(--color-good)] bg-[var(--color-good-soft)] text-[var(--color-good)]" : "border-[var(--color-line)] text-[var(--color-faint)]"}`}>{i.done ? "✓" : ""}</span>
                <div><div className={`font-medium ${i.done ? "text-[var(--color-muted)] line-through" : ""}`}>{i.title}</div>{!i.done ? <div className="text-[var(--color-muted)]">{i.hint}</div> : null}</div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Try it with sample data" description="A practice branch with medicines, stock, a near-expiry batch, an expired batch and a few sales. It is never billed and never mixed into your real figures.">
          {o.sampleDataVisible ? (
            <form action={removeSample}><button type="submit" className={secondaryButtonClass}>Hide the sample branch</button><p className="mt-3 text-[0.75rem] text-[var(--color-muted)]">Hidden, not deleted: stock and money records are never erased.</p></form>
          ) : (
            <form action={loadSample}><button type="submit" className={buttonClass}>Load the sample branch</button></form>
          )}
        </Card>
      </div>
    </>
  );
}
