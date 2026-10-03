import Image from "next/image";
import type { Metadata } from "next";
import { GuardForm } from "@/app/guard/form";

export const metadata: Metadata = { title: "Sojaa guard check-in", description: "Check in and out of your shift with your phone number and PIN." };

export default function GuardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-5 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src="/mark.svg" alt="" width={256} height={256} className="h-8 w-8" priority />
          <h1 className="text-[1.25rem] font-semibold tracking-[-0.02em]">Guard check-in</h1>
          <p className="text-[0.8125rem] text-[var(--color-muted)]">Use the phone number and PIN your firm gave you. Allow location, so your supervisor can see you are on site. The time is recorded by the server.</p>
        </div>
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6"><GuardForm /></div>
      </div>
    </main>
  );
}
