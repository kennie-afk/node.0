import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Dawa — pharmacy stock, expiry and dispensing records",
  description: "A pharmacy till that knows every batch and expiry, keeps the prescription and controlled-drug records, and closes the day against the cash."
};

const POINTS = [
  { title: "Never sell expired stock", detail: "Every delivery is entered by batch and expiry. The till sells the soonest-expiring batch first, refuses expired stock, and tells you what is about to expire while you can still return it." },
  { title: "Records a pharmacist can stand behind", detail: "Prescription items need the patient and the prescriber. Controlled drugs need a second person to confirm. The records cannot be edited afterwards, and export to a spreadsheet in one click." },
  { title: "Scan the pack", detail: "Scan the 2D code on a pack and the batch, expiry and serial number are read for you. A pack scanned twice, or one you never received, is stopped at the till." },
  { title: "Cash that adds up", detail: "M-Pesa payments match their sales by themselves. At the end of the day each cashier's cash is counted against what the system expects, and the difference is on record." }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Image src="/mark.svg" alt="" width={256} height={256} className="h-6 w-6" priority />
          <span className="text-[0.95rem] font-semibold tracking-[-0.01em]">Dawa</span>
        </div>
        <nav className="flex items-center gap-5 text-[0.8125rem] text-[var(--color-muted)]">
          <Link href="/pricing" className="hover:text-[var(--color-ink)]">Pricing</Link>
          <Link href="/login" className="hover:text-[var(--color-ink)]">Sign in</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-14 pt-10 text-center">
        <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.3rem]">A pharmacy till that knows every batch.</h1>
        <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-muted)]">
          Point of sale, batch and expiry stock, dispensing records and the controlled-drug register, for one pharmacy or several. Try it with sample data first, then enter your own.
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
          <h2 className="text-[0.9375rem] font-semibold">What Dawa is not</h2>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--color-muted)]">
            Dawa is <strong>not connected</strong> to the national medicine track-and-trace platforms: no interface for software has been published to us, and we will not pretend otherwise. It records what such a report would contain, by batch and serial number, and exports it. You still register on the government platforms yourself as the Ministry requires. Dawa does not decide what the law classes a medicine as; you set that for each product.
          </p>
        </div>
      </section>
    </main>
  );
}
