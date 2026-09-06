"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/actions";
import { Field, Notice, buttonClass, inputClass } from "@/components/ui";

const INITIAL: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <Field label="Phone number">
        <input
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="username"
          placeholder="254700000003"
          defaultValue=""
          className={inputClass}
          required
        />
      </Field>

      <Field label="PIN">
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="••••"
          className={inputClass}
          required
        />
      </Field>

      <button type="submit" className={`${buttonClass} mt-1 w-full justify-center`} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
