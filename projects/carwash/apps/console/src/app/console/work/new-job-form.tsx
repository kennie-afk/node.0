"use client";

import { useActionState, useRef } from "react";
import { createJob, type FormState } from "@/app/actions";
import { Field, Notice, buttonClass, inputClass, selectClass } from "@/components/ui";
import { ksh, type Service } from "@/lib/types";

const INITIAL: FormState = { error: null };

export function NewJobForm({
  services,
  bays,
  sites
}: {
  services: Service[];
  bays: { id: string; label: string }[];
  /** only for an owner who is not tied to one site */
  sites: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (previous: FormState, form: FormData) => {
    const result = await createJob(previous, form);
    if (!result.error) formRef.current?.reset();
    return result;
  }, INITIAL);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      {sites.length > 1 ? (
        <Field label="Site">
          <select name="siteId" className={selectClass} required>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="Number plate" hint="Optional, but it lets the camera and the payment find this car.">
        <input name="plate" className={`${inputClass} uppercase`} placeholder="KDA 123A" autoComplete="off" maxLength={16} />
      </Field>

      <fieldset>
        <legend className="text-[0.8125rem] font-medium">Services</legend>
        <div className="mt-2 flex flex-col gap-2">
          {services.map((service) => (
            <label key={service.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] px-3 py-2 text-[0.8125rem]">
              <span className="flex items-center gap-2">
                <input type="checkbox" name="serviceIds" value={service.id} />
                {service.name}
              </span>
              <span className="tabular-nums text-[var(--color-muted)]">{ksh(service.listPriceCents)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {bays.length > 1 ? (
        <Field label="Bay">
          <select name="bayId" className={selectClass}>
            <option value="">Not set</option>
            {bays.map((bay) => (
              <option key={bay.id} value={bay.id}>
                {bay.label}
              </option>
            ))}
          </select>
        </Field>
      ) : bays.length === 1 ? (
        <input type="hidden" name="bayId" value={bays[0]!.id} />
      ) : null}

      <button type="submit" className={`${buttonClass} w-full justify-center py-2.5`} disabled={pending}>
        {pending ? "Recording…" : "Record job"}
      </button>
    </form>
  );
}
