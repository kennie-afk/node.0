import Link from "next/link";
import { api, describeError } from "@/lib/api";
import type { Onboarding } from "@/lib/types";
import { Card, Meter, Notice, PageHeader, buttonClass, dangerButtonClass, secondaryButtonClass } from "@/components/ui";
import { loadSample, removeSample } from "@/app/actions";

export default async function GetStartedPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: actionError } = await searchParams;
  let data: Onboarding | null = null;
  let error: string | null = null;

  try {
    data = await api.get<Onboarding>("/v1/onboarding");
  } catch (caught) {
    error = describeError(caught);
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="Get started" />
        <Notice tone="danger">{error}</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Get started"
        subtitle="Four steps from a new account to your first reconciliation. Each one ticks itself when it is true, so this list always matches your account."
      />

      {actionError ? (
        <div className="mb-4">
          <Notice tone="danger">{actionError}</Notice>
        </div>
      ) : null}

      <Card
        title={`${data.completed} of ${data.total} done`}
        description="You can try the product with sample data first, before connecting anything."
      >
        <Meter value={data.completed / data.total} tone={data.completed === data.total ? "good" : "accent"} />
        <ol className="mt-5 divide-y divide-[var(--color-line)]">
          {data.steps.map((step, index) => (
            <li key={step.key} className="flex items-start justify-between gap-4 py-3">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-semibold ${
                    step.done
                      ? "border-[var(--color-good)] bg-[var(--color-good)] text-white"
                      : "border-[var(--color-line)] text-[var(--color-muted)]"
                  }`}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <div>
                  <p className="text-[0.875rem] font-medium">{step.title}</p>
                  <p className="mt-0.5 text-[0.75rem] text-[var(--color-muted)]">{step.detail}</p>
                </div>
              </div>
              {!step.done ? (
                <Link href={step.href} className={secondaryButtonClass}>
                  Open
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-5">
        <Card
          title="Try it with sample data"
          description="One sample car wash with two weeks of jobs, payments and water readings. Forecourt's real checks run over it, so the flags are produced, not typed. It is labelled sample everywhere and never counted in your billing or your own figures."
        >
          {data.sample.loaded ? (
            <form action={removeSample} className="flex flex-wrap items-center gap-3">
              <Link href="/console/found" className={buttonClass}>
                See what it found
              </Link>
              <button type="submit" className={dangerButtonClass}>
                Remove sample data
              </button>
            </form>
          ) : data.sample.canLoad ? (
            <form action={loadSample}>
              <button type="submit" className={buttonClass}>
                Load sample data
              </button>
            </form>
          ) : (
            <p className="text-[0.8125rem] text-[var(--color-muted)]">
              Sample data is only offered to a new account, so it can never be mixed in with your real records.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
