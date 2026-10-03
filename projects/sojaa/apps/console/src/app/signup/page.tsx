import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/app/signup/form";

export const metadata: Metadata = {
  title: "Get started with Sojaa",
  description: "Start a 14-day free trial. No card, no setup fee."
};

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Link href="/" className="flex flex-col items-center gap-3">
            <Image src="/mark.svg" alt="" width={256} height={256} className="h-8 w-8" priority />
            <div>
              <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
                Get started
              </h1>
              <p className="mt-1 text-[0.8125rem] text-[var(--color-muted)]">
                Start your free trial. Set up in minutes, no card needed.
              </p>
            </div>
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
          <SignupForm />
        </div>

        <p className="mt-5 text-center text-[0.75rem] text-[var(--color-faint)]">
          Already set up?{" "}
          <Link href="/login" className="text-[var(--color-accent)]">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
