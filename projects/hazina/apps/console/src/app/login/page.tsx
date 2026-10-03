import Image from "next/image";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { LoginForm } from "@/app/login/form";

export default async function LoginPage() {
  if (await readSession()) {
    redirect("/console");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-5 py-12">
      <div className="w-full max-w-[352px]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Image src="/mark.svg" alt="" width={256} height={256} className="h-8 w-8" priority />
          <div>
            <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
              Hazina
            </h1>
            <p className="mt-1 text-[0.8125rem] text-[var(--color-muted)]">
              Sign in with your phone number and PIN.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-[0.8125rem] text-[var(--color-muted)]">
          New here? <a href="/signup" className="font-medium text-[var(--color-accent)] underline">Start a free trial</a>
        </p>

        <p className="mt-5 text-center text-[0.75rem] text-[var(--color-faint)]">
          Locked out? Ask your manager or the owner to reset your PIN from Team.
        </p>
      </div>
    </main>
  );
}
