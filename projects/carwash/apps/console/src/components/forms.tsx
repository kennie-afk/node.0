"use client";

import { useActionState } from "react";
import {
  changeMyPin,
  provisionDevice,
  removeBay,
  resetPersonPin,
  resolveFlag,
  saveBay,
  saveService,
  saveSite,
  saveUser,
  voidJob,
  type DeviceState,
  type FormState,
  type PinState
} from "@/app/actions";
import { Field, Notice, buttonClass, dangerButtonClass, inputClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { DAY_NAMES, clock, type Person, type Service, type SiteDetail } from "@/lib/types";

const INITIAL: FormState = { error: null };

function Errors({ state }: { state: FormState }) {
  return state.error ? <Notice tone="danger">{state.error}</Notice> : null;
}

export function SiteForm({ site }: { site?: SiteDetail }) {
  const [state, action, pending] = useActionState(saveSite, INITIAL);
  const days = site?.daysOpen ?? [0, 1, 2, 3, 4, 5, 6];
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Errors state={state} />
      {site ? <input type="hidden" name="id" value={site.id} /> : null}
      <Field label="Site name">
        <input name="name" defaultValue={site?.name} required minLength={2} className={inputClass} placeholder="Westlands" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Till number" hint="The Safaricom till or paybill that customers pay into. Leave empty until it is issued.">
          <input name="tillNumber" defaultValue={site?.tillNumber ?? ""} className={inputClass} placeholder="5110001" />
        </Field>
        <Field label="Time zone">
          <input name="timezone" defaultValue={site?.timezone ?? "Africa/Nairobi"} className={inputClass} />
        </Field>
        <Field label="Opens (local time)">
          <input name="opens" defaultValue={clock(site?.opensMinute ?? 360)} className={inputClass} placeholder="06:00" />
        </Field>
        <Field label="Closes (local time)">
          <input name="closes" defaultValue={clock(site?.closesMinute ?? 1140)} className={inputClass} placeholder="19:00" />
        </Field>
        <Field label="Litres per wash" hint="What one wash normally uses here. Water beyond this is read as washes nobody recorded.">
          <input name="litresPerWash" type="number" step="0.1" min="1" defaultValue={site?.litresPerWash ?? 60} className={inputClass} />
        </Field>
        <Field label="Usual cash share (%)" hint="Cash far above this on a day is flagged.">
          <input name="cashPercent" type="number" step="1" min="0" max="100" defaultValue={Math.round((site?.cashRatio ?? 0.3) * 100)} className={inputClass} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-[0.8125rem] font-medium">Open on</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {DAY_NAMES.map((name, index) => (
            <label key={name} className="flex items-center gap-1.5 text-[0.8125rem]">
              <input type="checkbox" name="days" value={index} defaultChecked={days.includes(index)} />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Saving…" : site ? "Save changes" : "Add site"}
        </button>
        <a href={site ? `/console/sites/${site.id}` : "/console/sites"} className={secondaryButtonClass}>
          Cancel
        </a>
      </div>
    </form>
  );
}

export function BayRow({ siteId, bay }: { siteId: string; bay: { id: string; label: string; devices: number; jobs: number } }) {
  const [renameState, rename, renaming] = useActionState(saveBay, INITIAL);
  const [removeState, remove, removing] = useActionState(removeBay, INITIAL);
  return (
    <li className="border-b border-[var(--color-line)] py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <form action={rename} className="flex items-center gap-2">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="bayId" value={bay.id} />
          <input name="label" defaultValue={bay.label} className={`${inputClass} !mt-0 w-36`} aria-label="Bay name" />
          <button type="submit" className={secondaryButtonClass} disabled={renaming}>
            Rename
          </button>
        </form>
        <span className="text-[0.75rem] text-[var(--color-muted)]">
          {bay.devices} device{bay.devices === 1 ? "" : "s"} · {bay.jobs} job{bay.jobs === 1 ? "" : "s"}
        </span>
        <form action={remove} className="ml-auto">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="bayId" value={bay.id} />
          <button type="submit" className={dangerButtonClass} disabled={removing || bay.jobs > 0} title={bay.jobs > 0 ? "Bays with recorded jobs are kept for the history" : undefined}>
            Remove
          </button>
        </form>
      </div>
      {renameState.error || removeState.error ? (
        <div className="mt-2">
          <Notice tone="danger">{renameState.error ?? removeState.error}</Notice>
        </div>
      ) : null}
    </li>
  );
}

export function AddBayForm({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(saveBay, INITIAL);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="siteId" value={siteId} />
      <input name="label" placeholder="Bay 4" className={`${inputClass} !mt-0 w-36`} aria-label="New bay name" required />
      <button type="submit" className={buttonClass} disabled={pending}>
        Add bay
      </button>
      {state.error ? <span className="text-[0.75rem] text-[var(--color-danger)]">{state.error}</span> : null}
    </form>
  );
}

export function ServiceForm({ service }: { service?: Service }) {
  const [state, action, pending] = useActionState(saveService, INITIAL);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Errors state={state} />
      {service ? <input type="hidden" name="id" value={service.id} /> : null}
      <Field label="Name">
        <input name="name" defaultValue={service?.name} required minLength={2} className={inputClass} placeholder="Basic wash" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="List price (KSh)" hint="Applies to jobs opened from now on; recorded jobs keep the price they were sold at.">
          <input name="price" type="number" min="0" step="10" defaultValue={service ? service.listPriceCents / 100 : ""} required className={inputClass} />
        </Field>
        <Field label="Expected duration (minutes)">
          <input name="minutes" type="number" min="0" step="1" defaultValue={service ? Math.round(service.expectedDurationS / 60) : 20} className={inputClass} />
        </Field>
        <Field label="Expected water (litres)" hint="Zero for add-ons that use no water.">
          <input name="water" type="number" min="0" step="1" defaultValue={service?.expectedWaterL ?? 60} className={inputClass} />
        </Field>
        <Field label="Worker commission (%)">
          <input name="commission" type="number" min="0" max="100" step="1" defaultValue={Math.round((service?.commissionRate ?? 0.1) * 100)} className={inputClass} />
        </Field>
      </div>
      <Field
        label="Consumables per wash"
        hint="What one wash of this service normally uses, one per line as name=amount, for example detergent=0.05. The names must match the stock items your site records. Without this, supply theft cannot be detected."
      >
        <textarea
          name="consumables"
          rows={3}
          className={inputClass}
          placeholder="detergent=0.05"
          defaultValue={Object.entries(service?.consumables ?? {})
            .map(([name, amount]) => `${name}=${amount}`)
            .join("\n")}
        />
      </Field>
      <label className="flex items-center gap-2 text-[0.8125rem]">
        <input type="checkbox" name="active" defaultChecked={service?.active ?? true} />
        On the price list (switch off to stop selling it without losing its history)
      </label>
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Saving…" : service ? "Save changes" : "Add service"}
        </button>
        <a href="/console/services" className={secondaryButtonClass}>
          Cancel
        </a>
      </div>
    </form>
  );
}

const ROLES = [
  { value: "worker", label: "Worker - records jobs at one site" },
  { value: "supervisor", label: "Supervisor - watches a site's floor" },
  { value: "manager", label: "Manager - runs a site, resolves flags" },
  { value: "owner", label: "Owner - everything" },
  { value: "support", label: "Support - can close days" }
];

export function UserForm({ person, sites }: { person?: Person; sites: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveUser, INITIAL);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Errors state={state} />
      {person ? <input type="hidden" name="id" value={person.id} /> : null}
      <Field label="Full name">
        <input name="displayName" defaultValue={person?.displayName} required minLength={2} className={inputClass} />
      </Field>
      {person ? (
        <p className="text-[0.75rem] text-[var(--color-muted)]">Signs in with {person.phone}. A phone number cannot be changed; add a new person instead.</p>
      ) : (
        <Field label="Phone number" hint="07xx, +254 or 254 form. One number can belong to one account.">
          <input name="phone" type="tel" required className={inputClass} placeholder="0712 345 678" />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role">
          <select name="role" defaultValue={person?.role ?? "worker"} className={selectClass}>
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Site" hint="Workers must be tied to a site. Owners usually are not.">
          <select name="siteId" defaultValue={person?.siteId ?? ""} className={selectClass}>
            <option value="">All sites</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={person ? "New PIN (leave empty to keep)" : "PIN"} hint="At least 4 digits. They sign in with phone and PIN.">
          <input name="pin" type="password" inputMode="numeric" minLength={4} required={!person} autoComplete="new-password" className={inputClass} />
        </Field>
        {person ? (
          <Field label="Status">
            <select name="status" defaultValue={person.status} className={selectClass}>
              <option value="active">Active</option>
              <option value="suspended">Suspended - cannot sign in</option>
            </select>
          </Field>
        ) : null}
      </div>
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Saving…" : person ? "Save changes" : "Add person"}
        </button>
        <a href="/console/team" className={secondaryButtonClass}>
          Cancel
        </a>
      </div>
    </form>
  );
}

export function ResolveForm({ id, state, canResolve }: { id: string; state: string; canResolve: boolean }) {
  const [result, action, pending] = useActionState(resolveFlag, INITIAL);
  if (!canResolve) {
    return <Notice>Only a manager or owner can resolve a flag.</Notice>;
  }
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Errors state={result} />
      <input type="hidden" name="id" value={id} />
      <Field label="What did you find?" hint="Explained: there is an innocent reason. Confirmed: it was real. Dismissed: a false alarm. Write it so the next person does not have to ask.">
        <textarea name="note" rows={4} className={inputClass} placeholder="Spoke to the attendant; …" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="state" value="explained" className={secondaryButtonClass} disabled={pending}>
          Mark explained
        </button>
        <button type="submit" name="state" value="confirmed" className={dangerButtonClass} disabled={pending}>
          Confirm as real
        </button>
        <button type="submit" name="state" value="dismissed" className={secondaryButtonClass} disabled={pending}>
          Dismiss
        </button>
        {state !== "open" ? (
          <button type="submit" name="state" value="open" className={secondaryButtonClass} disabled={pending}>
            Reopen
          </button>
        ) : null}
      </div>
    </form>
  );
}


const PIN_INITIAL: PinState = { error: null, done: false };

export function ChangePinForm() {
  const [state, action, pending] = useActionState(changeMyPin, PIN_INITIAL);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.done ? <Notice tone="good">Your PIN is changed. Any other phone signed in as you has been signed out.</Notice> : null}
      <Field label="Current PIN">
        <input name="currentPin" type="password" inputMode="numeric" autoComplete="current-password" required className={inputClass} />
      </Field>
      <Field label="New PIN" hint="At least 6 characters.">
        <input name="newPin" type="password" inputMode="numeric" minLength={6} autoComplete="new-password" required className={inputClass} />
      </Field>
      <Field label="New PIN again">
        <input name="confirm" type="password" inputMode="numeric" minLength={6} autoComplete="new-password" required className={inputClass} />
      </Field>
      <div>
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Saving…" : "Change PIN"}
        </button>
      </div>
    </form>
  );
}

export function ResetPinForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(resetPersonPin, PIN_INITIAL);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.pin ? (
        <Notice tone="warn">
          New PIN for {name}: <span className="font-mono text-[1rem] font-semibold tracking-widest">{state.pin}</span>. Tell them now. It is not stored anywhere readable and will not be shown again; they should change it after signing in.
        </Notice>
      ) : null}
      <input type="hidden" name="id" value={id} />
      <p className="text-[0.75rem] text-[var(--color-muted)]">Forgot their PIN? This makes a new one and signs them out everywhere.</p>
      <div>
        <button type="submit" className={dangerButtonClass} disabled={pending}>
          {pending ? "Resetting…" : "Reset PIN"}
        </button>
      </div>
    </form>
  );
}

const DEVICE_TYPES = [
  { value: "flow_meter", label: "Flow meter" },
  { value: "pump_monitor", label: "Pump monitor" },
  { value: "machine", label: "Machine counter" },
  { value: "camera", label: "Plate camera" },
  { value: "beam", label: "Beam sensor" },
  { value: "doser", label: "Doser" }
];

export function DeviceForm({ sites, bays }: { sites: { id: string; name: string }[]; bays: { id: string; label: string; site: string }[] }) {
  const [state, action, pending] = useActionState(provisionDevice, { error: null, created: null } as DeviceState);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.created ? (
        <Notice tone="warn">
          <p className="font-medium">Copy this secret now. It is shown once and cannot be recovered.</p>
          <dl className="mt-2 grid gap-1 font-mono text-[0.75rem]">
            <div className="break-all">
              <dt className="inline text-[var(--color-muted)]">X-Device-Id: </dt>
              <dd className="inline">{state.created.id}</dd>
            </div>
            <div className="break-all">
              <dt className="inline text-[var(--color-muted)]">X-Device-Secret: </dt>
              <dd className="inline select-all">{state.created.secret}</dd>
            </div>
          </dl>
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Site">
          <select name="siteId" required className={selectClass} defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kind of device">
          <select name="type" required className={selectClass} defaultValue="flow_meter">
            {DEVICE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bay" hint="Leave empty for a gate camera or a whole-site device. The bay must belong to the chosen site.">
          <select name="bayId" className={selectClass} defaultValue="">
            <option value="">No bay</option>
            {bays.map((bay) => (
              <option key={bay.id} value={bay.id}>
                {bay.site} · {bay.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Firmware (optional)">
          <input name="firmware" maxLength={40} className={inputClass} placeholder="fm-2.4.1" />
        </Field>
      </div>
      <div>
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Registering…" : "Register device"}
        </button>
      </div>
    </form>
  );
}

export function VoidForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(voidJob, INITIAL);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="id" value={id} />
      <Field
        label="Reverse this sale"
        hint="Use when the customer was refunded or the sale was recorded by mistake. The payment is marked reversed, the job stops counting as work done, and your name and these words stay on the record. Forecourt does not send the money back; do that from your till."
      >
        <textarea name="reason" rows={2} required minLength={5} className={inputClass} placeholder="Customer complained about the wash; refunded in cash." />
      </Field>
      <div>
        <button type="submit" className={dangerButtonClass} disabled={pending}>
          {pending ? "Reversing…" : "Void and refund"}
        </button>
      </div>
    </form>
  );
}
