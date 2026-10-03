import Link from "next/link";
import { api } from "@/lib/api";
import type { Onboarding } from "@/lib/types";
import { Card, Notice, PageHeader } from "@/components/ui";

const WHERE: Record<string, string> = { members: "/console/members", products: "/console/loans/products", deposit: "/console/savings", staff: "/console/team", paybill: "/console/branches", loan: "/console/loans", repay: "/console/loans", return: "/console/returns" };

export default async function GetStarted() {
  const o = await api.get<Onboarding>("/v1/onboarding");
  return (
    <>
      <PageHeader title="Get started" subtitle={`${o.total} steps to a ${o.kind === "sacco" ? "SACCO" : "lender"} that runs on Hazina. Each one ticks itself when it is really done.`} />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card title={`${o.doneCount} of ${o.total} done`}>
          <ol className="flex flex-col gap-3">
            {o.items.map((i) => (
              <li key={i.key} className="flex gap-3 text-[0.8125rem]">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] ${i.done ? "border-[var(--color-good)] bg-[var(--color-good-soft)] text-[var(--color-good)]" : "border-[var(--color-line)] text-[var(--color-faint)]"}`}>{i.done ? "✓" : ""}</span>
                <div><div className={`font-medium ${i.done ? "text-[var(--color-muted)] line-through" : ""}`}>{WHERE[i.key] && !i.done ? <Link href={WHERE[i.key]!} className="underline">{i.title}</Link> : i.title}</div>{!i.done ? <div className="text-[var(--color-muted)]">{i.hint}</div> : null}</div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Before you rely on it">
          <Notice tone="warn">Hazina does not file returns with any regulator, and live M-Pesa matching needs your paybill registered with Safaricom first. Until then, record M-Pesa payments by their code and use the simulator on the M-Pesa page, if it is switched on, to see how matching behaves.</Notice>
          {o.isSample ? <p className="mt-3 text-[0.8125rem] text-[var(--color-muted)]">This is a sample organisation. To start your own records, sign up again without the sample option.</p> : null}
        </Card>
      </div>
    </>
  );
}
