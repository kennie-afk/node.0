"use client";

import { useActionState } from "react";
import { requestSignup, type SignupState } from "@/app/actions";
import { Field, Notice, buttonClass, inputClass } from "@/components/ui";

const INITIAL: SignupState = { error: null, done: false };

export function SignupForm() {
  const [state, action, pending] = useActionState(requestSignup, INITIAL);

  if (state.done) {
    return (
      <Notice tone="good">
        Thanks — we&apos;ve got your details. We&apos;ll reach out on the phone number you gave us to
        get your site set up.
      </Notice>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <Field label="Business name">
        <input
          name="businessName"
          type="text"
          placeholder="Amina Car Wash"
          className={inputClass}
          required
          minLength={2}
        />
      </Field>

      <Field label="Your name">
        <input
          name="contactName"
          type="text"
          placeholder="Amina Wanjiru"
          className={inputClass}
          required
          minLength={2}
        />
      </Field>

      <Field label="Phone number">
        <input
          name="phone"
          type="tel"
          inputMode="numeric"
          placeholder="254700000003"
          className={inputClass}
          required
        />
      </Field>

      <Field label="Number of sites">
        <input
          name="siteCount"
          type="number"
          min={1}
          max={500}
          defaultValue={1}
          className={inputClass}
        />
      </Field>

      <Field label="Anything else we should know (optional)">
        <textarea name="notes" rows={3} className={inputClass} />
      </Field>

      <button type="submit" className={`${buttonClass} mt-1 w-full justify-center`} disabled={pending}>
        {pending ? "Sending…" : "Request access"}
      </button>
    </form>
  );
}
