"use client";

import { useActionState } from "react";
import { requestSignup, resendSignupCode, verifySignup, type SignupState, type VerifyState } from "@/app/actions";
import { Field, Notice, buttonClass, inputClass, secondaryButtonClass, selectClass } from "@/components/ui";

const INITIAL: SignupState = { error: null, pending: null };
const VERIFY_INITIAL: VerifyState = { error: null, notice: null };

export function SignupForm() {
  const [state, action, pending] = useActionState(requestSignup, INITIAL);

  if (state.pending) {
    return <VerifyForm pending={state.pending} />;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <Field label="Firm name">
        <input name="businessName" type="text" placeholder="Tumaini Security Services Ltd" className={inputClass} required minLength={2} />
      </Field>

      <Field label="Your name">
        <input name="contactName" type="text" placeholder="Faith Wambui" className={inputClass} required minLength={2} />
      </Field>

      <Field label="Your phone number" hint="This is how you sign in. We send a code to it to check it is yours.">
        <input name="phone" type="tel" inputMode="numeric" placeholder="0712 345 678" className={inputClass} required />
      </Field>

      <Field label="Roughly how many guards do you employ?" hint="Optional. It does not change what you are charged.">
        <input name="expectedGuards" type="number" min={0} className={inputClass} />
      </Field>

      <Field label="Registration number" hint="Optional.">
        <input name="registrationNo" type="text" className={inputClass} />
      </Field>

      <label className="flex items-start gap-2 text-[0.8125rem] text-[var(--color-muted)]">
        <input name="sample" type="checkbox" className="mt-0.5" />
        <span>Give me a <strong>sample firm</strong> to look around first (made-up guards, sites and invoices, never billed). Leave this off to start your own records.</span>
      </label>

      <button type="submit" className={`${buttonClass} mt-1 w-full justify-center`} disabled={pending}>
        {pending ? "Sending…" : "Continue"}
      </button>
    </form>
  );
}

function VerifyForm({ pending }: { pending: NonNullable<SignupState["pending"]> }) {
  const [state, action, working] = useActionState(verifySignup, VERIFY_INITIAL);
  const [resent, resend, resending] = useActionState(resendSignupCode, VERIFY_INITIAL);

  return (
    <div className="flex flex-col gap-4">
      {pending.delivery === "sent" ? (
        <Notice tone="good">
          We sent a six-digit code to {pending.phone}. It works for {pending.expiresInMinutes} minutes.
        </Notice>
      ) : (
        <Notice tone="warn">
          Text messages are not switched on for this installation yet, so the code could not be sent to {pending.phone}.
          Ask your Askari contact to read it to you.
        </Notice>
      )}

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={pending.id} />
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

        <Field label="Code">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={inputClass} required />
        </Field>
        <Field label="Choose a PIN" hint="Six digits. You will sign in with your phone number and this PIN.">
          <input name="pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} className={inputClass} required />
        </Field>
        <Field label="Repeat the PIN">
          <input name="confirm" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} className={inputClass} required />
        </Field>

        <button type="submit" className={`${buttonClass} mt-1 w-full justify-center`} disabled={working}>
          {working ? "Setting up…" : "Create my account"}
        </button>
      </form>

      <form action={resend} className="text-center">
        <input type="hidden" name="id" value={pending.id} />
        {resent.error ? <p className="mb-2 text-[0.75rem] text-[var(--color-danger)]">{resent.error}</p> : null}
        {resent.notice ? <p className="mb-2 text-[0.75rem] text-[var(--color-good)]">{resent.notice}</p> : null}
        <button type="submit" className={`${secondaryButtonClass} text-[0.75rem]`} disabled={resending}>
          Send a new code
        </button>
      </form>
    </div>
  );
}
