"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/actions";
import { IDLE } from "@/lib/state";
import { Notice, buttonClass } from "@/components/ui";
import { useFlash } from "@/components/flash";

/** A form bound to a server action: shows what went wrong, or what was done, and anything to be shown once (a new PIN). */
export function ActionForm({
  action, children, submit, className = "flex flex-col gap-3", button = buttonClass
}: {
  action: (previous: FormState, form: FormData) => Promise<FormState>;
  children: ReactNode;
  submit: string;
  className?: string;
  button?: string;
}) {
  const flash = useFlash();
  // A plain confirmation goes to the page-level banner. It is raised here, as the action resolves, because what the action did
  // may remove this very form from the page (a swap moving to approved), and a removed form never renders its own result.
  const [state, run, pending] = useActionState(async (previous: FormState, form: FormData) => {
    const result = await action(previous, form);
    if (result.ok && !result.secret) flash(result.ok);
    return result;
  }, IDLE);
  return (
    <form action={run} className={className}>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok && state.secret ? (
        <Notice tone="good">
          {state.ok}
          {state.secret ? <strong className="ml-2 select-all rounded bg-white px-2 py-0.5 font-mono text-[1rem] tracking-widest">{state.secret}</strong> : null}
        </Notice>
      ) : null}
      {children}
      <div>
        <button type="submit" className={button} disabled={pending}>
          {pending ? "Working…" : submit}
        </button>
      </div>
    </form>
  );
}
