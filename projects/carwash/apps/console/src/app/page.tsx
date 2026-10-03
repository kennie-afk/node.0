import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Forecourt — is your cashier stealing from you?",
  description:
    "Forecourt watches the cars, the water and the money separately at your car wash, so nobody can fake one without the others catching it."
};

const SIGNALS = [
  {
    title: "A wash gets marked done that never happened",
    detail: "No water was used, no car was seen at the bay — but it's in the books as paid work."
  },
  {
    title: "The price gets quietly discounted, in cash",
    detail: "A full-price wash is logged, the customer pays less in cash, and the difference disappears."
  },
  {
    title: "Extras get sold off the books",
    detail: "Wax, vacuuming, air freshener — sold for cash, never rung up, never seen again."
  }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Image src="/mark.svg" alt="" width={256} height={256} className="h-6 w-6" priority />
          <span className="text-[0.95rem] font-semibold tracking-[-0.01em]">Forecourt</span>
        </div>
        <nav className="flex items-center gap-5 text-[0.8125rem] text-[var(--color-muted)]">
          <Link href="/pricing" className="transition-colors hover:text-[var(--color-ink)]">
            Pricing
          </Link>
          <Link href="/login" className="transition-colors hover:text-[var(--color-ink)]">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-16 pt-10 text-center">
        <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.3rem]">
          Is your cashier stealing from you?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-muted)]">
          We watch the water, the cars, and the money separately at your car wash — so nobody can fake
          one without the other two catching it. Every day, you get told exactly how much money should
          have come in, how much did, and where the gap is.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup" className={`${buttonClass} px-6 py-2.5 text-[0.875rem]`}>
            Start free trial
          </Link>
          <Link href="/pricing" className={`${secondaryButtonClass} px-6 py-2.5 text-[0.875rem]`}>
            See pricing
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-16">
        <h2 className="mb-5 text-center text-[0.75rem] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
          What it catches
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SIGNALS.map((signal) => (
            <div
              key={signal.title}
              className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
            >
              <p className="text-[0.85rem] font-medium leading-snug">{signal.title}</p>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--color-muted)]">
                {signal.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-20">
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-center">
          <p className="text-[0.85rem] leading-relaxed text-[var(--color-muted)]">
            You don&apos;t need to trust anyone&apos;s notebook. A flow meter says how much water was
            used. An entry gate says how many cars came through. M-Pesa says how much money actually
            landed. When those three don&apos;t line up, that&apos;s the theft — and it&apos;s no
            longer invisible.
          </p>
          <Link href="/signup" className={`${buttonClass} mt-5 inline-flex px-6 py-2.5 text-[0.875rem]`}>
            Protect your site
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 pb-10 text-center text-[0.7rem] text-[var(--color-faint)]">
        Forecourt is revenue assurance for car washes. Not a point of sale, not a booking app —
        its only job is to make theft visible.
      </footer>
    </main>
  );
}
