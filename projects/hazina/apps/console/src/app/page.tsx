import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Hazina — member book, loans and M-Pesa reconciliation for SACCOs and lenders",
  description: "A ledger that balances, loans with a schedule and a second signature, M-Pesa payments matched to members and loans, and periodic summaries from your own records."
};

const POINTS = [
  { title: "A ledger that always balances", detail: "Every deposit, loan payout and repayment posts a balanced journal entry. Trial balance, income statement and balance sheet come from the same entries, and each figure downloads to a spreadsheet to check." },
  { title: "M-Pesa matched to the right account", detail: "Members pay your paybill quoting a member number or a loan number. Hazina matches the payment, splits a loan repayment into penalty, interest and principal, and keeps anything it cannot match in a queue for a person. Nothing is dropped." },
  { title: "Loans with a second signature", detail: "Apply, appraise, approve and pay out are separate steps, and the person who applied cannot also approve. The schedule is fixed when the money goes out, and arrears and portfolio at risk are read from it." },
  { title: "Summaries from your own records", detail: "Generate a membership, financial position or portfolio-quality summary for any period, from the ledger and the loan book. They are labelled as generic summaries, not regulator forms." }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Image src="/mark.svg" alt="" width={256} height={256} className="h-6 w-6" priority />
          <span className="text-[0.95rem] font-semibold tracking-[-0.01em]">Hazina</span>
        </div>
        <nav className="flex items-center gap-5 text-[0.8125rem] text-[var(--color-muted)]">
          <Link href="/pricing" className="hover:text-[var(--color-ink)]">Pricing</Link>
          <Link href="/login" className="hover:text-[var(--color-ink)]">Sign in</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-14 pt-10 text-center">
        <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.3rem]">The member book and loan ledger your auditor can follow.</h1>
        <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-muted)]">
          For SACCOs and non-bank lenders: members, savings, loans, M-Pesa reconciliation and a double-entry ledger in one place. Try it with sample data first, then enter your own.
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
          <h2 className="text-[0.9375rem] font-semibold">What Hazina is not</h2>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--color-muted)]">
            Hazina does <strong>not file anything</strong> with SASRA, the Central Bank or any other regulator, and its summaries are not in any regulator&apos;s format: you remain responsible for your returns. It is not a bank, and it does not hold your members&apos; money. The statement and payslip checks are arithmetic flags for a loan officer to read; they do not verify a document or decide a loan.
          </p>
        </div>
      </section>
    </main>
  );
}
