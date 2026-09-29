import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Forecourt pricing",
  description: "One price per site, per month. No setup fee, no percentage of your revenue."
};

const TIERS = [
  {
    name: "Starter",
    plan: "starter",
    sites: "1 site",
    price: "KES 3,500",
    detail: "Per site, per month. For a single-bay or single-site operation."
  },
  {
    name: "Growth",
    plan: "growth",
    sites: "2–5 sites",
    price: "KES 3,000",
    detail: "Per site, per month. For an owner running more than one location.",
    highlight: true
  },
  {
    name: "Multi-site",
    plan: "custom",
    sites: "6+ sites",
    price: "Talk to us",
    detail: "Volume pricing for a chain of sites, billed on one invoice."
  }
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/mark.svg" alt="" width={256} height={256} className="h-6 w-6" priority />
          <span className="text-[0.95rem] font-semibold tracking-[-0.01em]">Forecourt</span>
        </Link>
        <nav className="flex items-center gap-5 text-[0.8125rem] text-[var(--color-muted)]">
          <Link href="/login" className="transition-colors hover:text-[var(--color-ink)]">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-2xl px-6 pb-10 pt-8 text-center">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.02em]">
          One price per site. Nothing else.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[0.875rem] leading-relaxed text-[var(--color-muted)]">
          No setup fee, no percentage of your revenue, no long contract. A flat monthly fee per site,
          because the money it protects is yours, not ours.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-lg border p-5 ${
                tier.highlight
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)]"
              }`}
            >
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.06em] text-[var(--color-muted)]">
                {tier.sites}
              </p>
              <p className="mt-1.5 text-[1rem] font-semibold">{tier.name}</p>
              <p className="mt-2 text-[1.4rem] font-semibold tabular-nums">
                {tier.price}
                {tier.price !== "Talk to us" && (
                  <span className="text-[0.75rem] font-normal text-[var(--color-muted)]"> /site/mo</span>
                )}
              </p>
              <p className="mt-2.5 text-[0.75rem] leading-relaxed text-[var(--color-muted)]">
                {tier.detail}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-[0.75rem] text-[var(--color-faint)]">
          A flat fee, not a share of what the site earns. Introductory pricing; confirmed when we
          set you up.
        </p>

        <div className="mt-7 text-center">
          <Link href="/signup" className={`${buttonClass} px-6 py-2.5 text-[0.875rem]`}>
            Get started
          </Link>
          <Link
            href="/"
            className={`${secondaryButtonClass} ml-3 px-6 py-2.5 text-[0.875rem]`}
          >
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
