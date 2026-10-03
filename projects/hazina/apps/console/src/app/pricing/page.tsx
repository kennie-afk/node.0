import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass } from "@/components/ui";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "Hazina pricing", description: "One monthly price by size. No setup fee, no percentage of what you lend or collect." };
const kes = (cents: number) => `KES ${(cents / 100).toLocaleString("en-KE")}`;
const n = (value: number) => value.toLocaleString("en-KE");

export default async function PricingPage() {
  const p = await api.pricing();
  const tiers = [
    { name: "Small SACCO", range: `Up to ${n(p.sacco.smallMaxMembers)} active members`, price: kes(p.sacco.smallCents), detail: "Per month. Members, savings, loans, M-Pesa matching, ledger, returns and exports all included." },
    { name: "Larger SACCO", range: `${n(p.sacco.smallMaxMembers + 1)}–${n(p.sacco.mediumMaxMembers)} active members`, price: kes(p.sacco.mediumCents), detail: `Per month. Beyond ${n(p.sacco.mediumMaxMembers)} members, ${kes(p.sacco.extraPer1000Cents)} for each further 1,000 (or part of 1,000).`, highlight: true },
    { name: "Non-bank lender", range: `Up to ${n(p.lender.includedBorrowers)} active borrowers`, price: kes(p.lender.cents), detail: `Per month. Beyond that, ${kes(p.lender.extraPer1000Cents)} for each further 1,000 borrowers (or part of 1,000).` }
  ];
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5"><Image src="/mark.svg" alt="" width={256} height={256} className="h-6 w-6" priority /><span className="text-[0.95rem] font-semibold">Hazina</span></Link>
        <Link href="/login" className="text-[0.8125rem] text-[var(--color-muted)] hover:text-[var(--color-ink)]">Sign in</Link>
      </header>
      <section className="mx-auto max-w-2xl px-6 pb-8 pt-6 text-center">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.02em]">One price, by size.</h1>
        <p className="mx-auto mt-3 max-w-md text-[0.875rem] leading-relaxed text-[var(--color-muted)]">No setup fee, no share of what you lend or collect. Start with a {p.trialDays}-day free trial; nothing is charged until it ends. You are billed for the active members (or borrowers) you have on the day the invoice is issued.</p>
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
        {p.provisional ? <p className="mt-4 text-[0.75rem] text-[var(--color-faint)]">Prices are introductory and may change.</p> : null}
      </section>
    </main>
  );
}
