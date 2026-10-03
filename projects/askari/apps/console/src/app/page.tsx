import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Askari: guard attendance, rosters, payroll and invoices for security firms",
  description: "Prove who was on post, roster them, pay them against the minimum wage you configure, and bill clients only for verified shifts."
};

const POINTS = [
  { title: "Attendance you can prove", detail: "Check-ins are stamped by the server, never by the phone's clock, and compared with the site's map position. A check-in far from the site is flagged, not blocked. A missed shift shows up on the board while there is still time to phone someone." },
  { title: "Rosters that cannot double-book", detail: "A guard cannot be put on two overlapping shifts: the database refuses it, even if two supervisors try at the same moment. Swaps need a second person. Weekly-hour and rest limits are whatever you set." },
  { title: "Payroll checked against the minimum wage", detail: "Every month, each guard's pay is compared with the minimum wage you configure, and anyone below it is listed. Closed months never change; a correction is a separate adjustment. You confirm your own NSSF, SHA, housing-levy and PAYE tables: Askari states no statutory rate as fact." },
  { title: "Invoices from verified shifts", detail: "Clients are billed only for shifts where a guard was recorded checking in and out, each shift once, with the evidence attached. When a client disputes an invoice, you answer with times, not memory." }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Image src="/mark.svg" alt="" width={256} height={256} className="h-6 w-6" priority />
          <span className="text-[0.95rem] font-semibold tracking-[-0.01em]">Askari</span>
        </div>
        <nav className="flex items-center gap-5 text-[0.8125rem] text-[var(--color-muted)]">
          <Link href="/pricing" className="hover:text-[var(--color-ink)]">Pricing</Link>
          <Link href="/login" className="hover:text-[var(--color-ink)]">Sign in</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-14 pt-10 text-center">
        <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.3rem]">Know who was on post, and pay and bill from what you can prove.</h1>
        <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-muted)]">
          For private security firms: attendance, patrols, rosters, payroll against the minimum wage, and client invoices in one place. Try it with sample data first, then enter your own.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link href="/signup" className={buttonClass}>Start a free trial</Link>
          <Link href="/pricing" className={secondaryButtonClass}>See the price</Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-14 sm:grid-cols-2">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
            <h2 className="text-[0.9375rem] font-semibold">{p.title}</h2>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--color-muted)]">{p.detail}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-16">
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 className="text-[0.9375rem] font-semibold">What Askari is not</h2>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--color-muted)]">
            Askari does <strong>not verify</strong> a guard&apos;s PSRA registration, NSSF, SHA or KRA numbers: it keeps what you type. It does <strong>not report to PSRA</strong>, the Ministry of Labour or any authority, and it is not legal advice: the minimum wage and every rate are figures you set and confirm. It does not pay your guards or hold anyone&apos;s money. It records what happened; it cannot make a missing or false record true.
          </p>
        </div>
      </section>
    </main>
  );
}
