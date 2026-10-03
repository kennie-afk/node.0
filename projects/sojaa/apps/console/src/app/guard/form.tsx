"use client";

import { useActionState, useState } from "react";
import { guardSelf, type FormState } from "@/app/actions";
import { GeoFields } from "@/components/geo";
import { Field, Notice, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

const INITIAL: FormState = { error: null, ok: null };

export function GuardForm() {
  const [state, action, pending] = useActionState(guardSelf, INITIAL);
  const [mode, setMode] = useState<"in" | "out" | "scan">("in");
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="good">{state.ok}</Notice> : null}
      <Field label="Your phone number"><input name="phone" type="tel" inputMode="numeric" autoComplete="tel" className={inputClass} required placeholder="0712 345 678" /></Field>
      <Field label="Your PIN"><input name="pin" type="password" inputMode="numeric" autoComplete="current-password" className={inputClass} required /></Field>
      <div className="flex gap-2" role="radiogroup" aria-label="What are you doing">
        {(["in", "out", "scan"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={mode === m ? buttonClass : secondaryButtonClass} aria-pressed={mode === m}>{m === "in" ? "Check in" : m === "out" ? "Check out" : "Scan checkpoint"}</button>
        ))}
      </div>
      <input type="hidden" name="mode" value={mode} />
      {mode === "scan" ? <Field label="Checkpoint code" hint="Scan the QR on the wall with your phone's scanner and paste the code here."><input name="token" className={inputClass} required autoComplete="off" /></Field> : null}
      <GeoFields />
      <button type="submit" className={buttonClass} disabled={pending}>{pending ? "Working…" : mode === "in" ? "Check in now" : mode === "out" ? "Check out now" : "Record the scan"}</button>
    </form>
  );
}
