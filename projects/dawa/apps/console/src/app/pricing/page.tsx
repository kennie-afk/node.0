import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass } from "@/components/ui";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "Dawa pricing", description: "One monthly price per branch. No setup fee, no percentage of your sales." };
const kes = (cents: number) => `KES ${(cents / 100).toLocaleString("en-KE")}`;

export default async function PricingPage() {
  const pricing = await api.pricing();
  const tiers = [
    { name: "One branch", range: "1 branch", price: kes(pricing.firstBranchCents), detail: "Per month. Everything included: till, stock and expiry, dispensing records, controlled-drug register, reports." },
    { name: "More branches", range: `2–${pricing.listPriceMaxBranches} branches`, price: `+ ${kes(pricing.extraBranchCents)}`, detail: "Per additional branch, per month, on one invoice.", highlight: true },
    { name: "A chain", range: `${pricing.listPriceMaxBranches + 1}+ branches`, price: "Talk to us", detail: "An agreed price per branch, on one invoice." }
  ];
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5"><Image src="/mark.svg" alt="" width={256} height={256} className="h-6 w-6" priority /><span className="text-[0.95rem] font-semibold">Dawa</span></Link>
        <Link href="/login" className="text-[0.8125rem] text-[var(--color-muted)] hover:text-[var(--color-ink)]">Sign in</Link>
      </header>
      <section className="mx-auto max-w-2xl px-6 pb-8 pt-6 text-center">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.02em]">One price per branch.</h1>
        <p className="mx-auto mt-3 max-w-md text-[0.875rem] leading-relaxed text-[var(--color-muted)]">No setup fee, no share of your sales. Start with a {pricing.trialDays}-day free trial; nothing is charged until it ends.</p>
      </section>
      <section className="mx-auto grid max-w-4xl gap-4 px-6 pb-8 sm:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.name} className={`rounded-xl border bg-[var(--color-surface)] p-5 ${t.highlight ? "border-[var(--color-accent)]" : "border-[var(--color-line)]"}`}>
            <h2 className="text-[0.9375rem] font-semibold">{t.name}</h2>
            <p className="text-[0.75rem] text-[var(--color-muted)]">{t.range}</p>
            <p className="mt-4 text-[1.375rem] font-semibold tabular-nums">{t.price}</p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--color-muted)]">{t.detail}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-xl px-6 pb-16 text-center">
        <Link href="/signup" className={buttonClass}>Start a free trial</Link>
        {pricing.provisional ? <p className="mt-4 text-[0.75rem] text-[var(--color-faint)]">Prices are introductory and may change.</p> : null}
      </section>
    </main>
  );
}
