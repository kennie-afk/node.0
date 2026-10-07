"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, describeError } from "@/lib/api";
import { clearSession, readSession, writeSession } from "@/lib/session";
import { parseClock } from "@/lib/types";

export interface LoginState {
  error: string | null;
}

export async function signIn(_previous: LoginState, form: FormData): Promise<LoginState> {
  const phone = String(form.get("phone") ?? "").trim();
  const pin = String(form.get("pin") ?? "").trim();

  if (!phone || !pin) {
    return { error: "Enter both your phone number and PIN." };
  }

  let destination = "/console";
  try {
    const result = await api.login({ phone, pin });
    await writeSession(
      { token: result.token, displayName: result.displayName, role: result.role },
      result.expiresInSeconds
    );
    destination = result.role === "worker" || result.role === "supervisor" ? "/console/work" : "/console";
  } catch (caught) {
    return { error: describeError(caught) };
  }

  redirect(destination);
}

export async function signOut(): Promise<void> {
  // End the session on the server too, so a copied token stops working at once rather than at expiry.
  await api.send("POST", "/v1/auth/logout").catch(() => undefined);
  await clearSession();
  redirect("/login");
}

export interface SignupState {
  error: string | null;
  /** set once the details are in and a code is waiting to be entered */
  pending: { id: string; delivery: "sent" | "logged" | "failed"; phone: string; expiresInMinutes: number } | null;
}

export async function requestSignup(_previous: SignupState, form: FormData): Promise<SignupState> {
  const businessName = String(form.get("businessName") ?? "").trim();
  const contactName = String(form.get("contactName") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const siteCountRaw = String(form.get("siteCount") ?? "").trim();

  if (!businessName || !contactName || !phone) {
    return { error: "Business name, your name and phone number are required.", pending: null };
  }

  const siteCount = siteCountRaw ? Number.parseInt(siteCountRaw, 10) : undefined;

  try {
    const result = await api.signup({
      businessName,
      contactName,
      phone,
      siteCount: siteCount && Number.isFinite(siteCount) ? siteCount : undefined
    });
    return { error: null, pending: { id: result.id, delivery: result.delivery, phone, expiresInMinutes: result.expiresInMinutes } };
  } catch (caught) {
    return { error: describeError(caught), pending: null };
  }
}

export interface VerifyState {
  error: string | null;
  notice: string | null;
}

export async function verifySignup(_previous: VerifyState, form: FormData): Promise<VerifyState> {
  const id = String(form.get("id") ?? "");
  const code = String(form.get("code") ?? "").trim();
  const pin = String(form.get("pin") ?? "").trim();
  const confirm = String(form.get("confirm") ?? "").trim();

  if (!/^\d{6}$/.test(code)) return { error: "Enter the six-digit code.", notice: null };
  if (!/^\d{6}$/.test(pin)) return { error: "Choose a PIN of exactly six digits.", notice: null };
  if (pin !== confirm) return { error: "The two PINs are not the same.", notice: null };

  try {
    const result = await api.verifySignup({ id, code, pin });
    await writeSession({ token: result.token, displayName: result.displayName, role: result.role }, result.expiresInSeconds);
  } catch (caught) {
    return { error: describeError(caught), notice: null };
  }
  redirect("/console/get-started");
}

export async function resendSignupCode(_previous: VerifyState, form: FormData): Promise<VerifyState> {
  try {
    const result = await api.resendCode(String(form.get("id") ?? ""));
    return {
      error: null,
      notice: result.delivery === "sent" ? "A new code is on its way." : "A new code was issued. Ask your Forecourt contact for it."
    };
  } catch (caught) {
    return { error: describeError(caught), notice: null };
  }
}

// ---------------------------------------------------------------------------------------------
// Console write actions. Each one calls the API, which enforces role and organisation; the
// console only shapes the form input and reports the API's own refusal in plain words.
// ---------------------------------------------------------------------------------------------


export interface FormState {
  error: string | null;
}

const OK: FormState = { error: null };

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function number(form: FormData, name: string): number | null {
  const raw = text(form, name);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function shillingsToCents(form: FormData, name: string): number | null {
  const value = number(form, name);
  return value === null || Number.isNaN(value) ? null : Math.round(value * 100);
}

async function attempt(work: () => Promise<void>): Promise<FormState | null> {
  try {
    await work();
    return null;
  } catch (caught) {
    return { error: describeError(caught) };
  }
}

function siteBody(form: FormData): { body: Record<string, unknown>; error: string | null } {
  const opens = parseClock(text(form, "opens"));
  const closes = parseClock(text(form, "closes"));
  if (opens === null || closes === null) {
    return { body: {}, error: "Enter opening and closing times as HH:MM, for example 06:00." };
  }
  const litres = number(form, "litresPerWash");
  const cashPercent = number(form, "cashPercent");
  if (litres === null || Number.isNaN(litres) || cashPercent === null || Number.isNaN(cashPercent)) {
    return { body: {}, error: "Litres per wash and the cash baseline must be numbers." };
  }
  const days = form.getAll("days").map((value) => Number(value));
  if (days.length === 0) {
    return { body: {}, error: "Choose at least one day the site is open." };
  }
  return {
    error: null,
    body: {
      name: text(form, "name"),
      tillNumber: text(form, "tillNumber") || null,
      timezone: text(form, "timezone") || "Africa/Nairobi",
      opensMinute: opens,
      closesMinute: closes,
      daysOpen: days,
      litresPerWash: litres,
      cashRatio: cashPercent / 100
    }
  };
}

export async function saveSite(_previous: FormState, form: FormData): Promise<FormState> {
  const { body, error } = siteBody(form);
  if (error) return { error };
  const id = text(form, "id");
  let target = "/console/sites";
  const failed = await attempt(async () => {
    if (id) {
      await api.send("PUT", `/v1/sites/${id}`, body);
      target = `/console/sites/${id}`;
    } else {
      const created = await api.send<{ id: string }>("POST", "/v1/sites", body);
      target = `/console/sites/${created.id}`;
    }
  });
  if (failed) return failed;
  revalidatePath("/console/sites");
  redirect(target);
}

export async function saveBay(_previous: FormState, form: FormData): Promise<FormState> {
  const siteId = text(form, "siteId");
  const bayId = text(form, "bayId");
  const label = text(form, "label");
  if (!label) return { error: "Give the bay a name." };
  const failed = await attempt(async () => {
    if (bayId) await api.send("PUT", `/v1/bays/${bayId}`, { label });
    else await api.send("POST", `/v1/sites/${siteId}/bays`, { label });
  });
  if (failed) return failed;
  revalidatePath(`/console/sites/${siteId}`);
  return OK;
}

export async function removeBay(_previous: FormState, form: FormData): Promise<FormState> {
  const siteId = text(form, "siteId");
  const failed = await attempt(async () => {
    await api.send("DELETE", `/v1/bays/${text(form, "bayId")}`);
  });
  if (failed) return failed;
  revalidatePath(`/console/sites/${siteId}`);
  return OK;
}

/** "detergent=0.05" per line (or comma separated) -> { detergent: 0.05 }; null when a line does not parse. */
function parseConsumables(raw: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const part of raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)) {
    const match = /^([A-Za-z0-9_ .-]{1,60})\s*=\s*(\d+(?:\.\d+)?)$/.exec(part);
    if (!match) return null;
    out[match[1]!.trim()] = Number(match[2]);
  }
  return out;
}

export async function saveService(_previous: FormState, form: FormData): Promise<FormState> {
  const price = shillingsToCents(form, "price");
  const water = number(form, "water");
  const minutes = number(form, "minutes");
  const commission = number(form, "commission");
  if (price === null || price < 0) return { error: "Enter the price in shillings, for example 500." };
  if ([water, minutes, commission].some((value) => value !== null && Number.isNaN(value))) {
    return { error: "Water, minutes and commission must be numbers." };
  }
  const consumables = parseConsumables(text(form, "consumables"));
  if (consumables === null) return { error: "Consumables are written one per line as name=amount per wash, for example detergent=0.05." };
  const body = {
    name: text(form, "name"),
    consumables,
    listPriceCents: price,
    expectedWaterL: water ?? 0,
    expectedDurationS: Math.round((minutes ?? 0) * 60),
    commissionRate: (commission ?? 10) / 100,
    active: form.get("active") === "on"
  };
  const id = text(form, "id");
  const failed = await attempt(async () => {
    if (id) await api.send("PUT", `/v1/services/${id}`, body);
    else await api.send("POST", "/v1/services", body);
  });
  if (failed) return failed;
  revalidatePath("/console/services");
  redirect("/console/services");
}

export async function saveUser(_previous: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "id");
  const pin = text(form, "pin");
  const site = text(form, "siteId");
  const failed = await attempt(async () => {
    if (id) {
      await api.send("PUT", `/v1/users/${id}`, {
        displayName: text(form, "displayName"),
        role: text(form, "role"),
        siteId: site || null,
        status: text(form, "status") || "active",
        ...(pin ? { pin } : {})
      });
    } else {
      await api.send("POST", "/v1/users", {
        displayName: text(form, "displayName"),
        phone: text(form, "phone"),
        pin,
        role: text(form, "role"),
        siteId: site || null
      });
    }
  });
  if (failed) return failed;
  revalidatePath("/console/team");
  redirect("/console/team");
}

export async function resolveFlag(_previous: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "id");
  const failed = await attempt(async () => {
    await api.send("POST", `/v1/discrepancies/${id}/resolve`, { state: text(form, "state"), note: text(form, "note") || undefined });
  });
  if (failed) return failed;
  revalidatePath("/console/flags");
  redirect("/console/flags");
}


// ---- first hour: sample data, quick reconciliation, paying the subscription ------------------

export async function loadSample(): Promise<void> {
  try {
    await api.send("POST", "/v1/sandbox", {});
  } catch (caught) {
    redirect(`/console/get-started?error=${encodeURIComponent(describeError(caught))}`);
  }
  revalidatePath("/console", "layout");
  redirect("/console/found");
}

export async function removeSample(): Promise<void> {
  try {
    await api.send("DELETE", "/v1/sandbox");
  } catch (caught) {
    redirect(`/console/get-started?error=${encodeURIComponent(describeError(caught))}`);
  }
  revalidatePath("/console", "layout");
  redirect("/console/get-started");
}

export async function checkRecentDays(): Promise<void> {
  try {
    await api.send("POST", "/v1/reconcile/recent", { days: 14 });
  } catch (caught) {
    redirect(`/console/found?error=${encodeURIComponent(describeError(caught))}`);
  }
  revalidatePath("/console", "layout");
  redirect("/console/found");
}

export async function simulatePayment(): Promise<void> {
  try {
    await api.send("POST", "/v1/billing/mock-payment", {});
  } catch (caught) {
    redirect(`/console/billing?error=${encodeURIComponent(describeError(caught))}`);
  }
  revalidatePath("/console", "layout");
  redirect("/console/billing");
}


// ---- the attendant's screen: record a job, move it along, declare cash ------------------------

export async function createJob(_previous: FormState, form: FormData): Promise<FormState> {
  const serviceIds = form.getAll("serviceIds").map(String);
  if (serviceIds.length === 0) return { error: "Choose at least one service." };
  const plate = text(form, "plate");
  const bayId = text(form, "bayId");
  const siteId = text(form, "siteId");
  const failed = await attempt(async () => {
    await api.send("POST", "/v1/jobs", {
      serviceIds,
      ...(plate ? { plate } : {}),
      ...(bayId ? { bayId } : {}),
      ...(siteId ? { siteId } : {})
    });
  });
  if (failed) return failed;
  revalidatePath("/console/work");
  return OK;
}

export async function moveJob(form: FormData): Promise<void> {
  const id = text(form, "jobId");
  const type = text(form, "type");
  try {
    await api.send("POST", `/v1/jobs/${id}/events`, { type });
  } catch (caught) {
    redirect(`/console/work?error=${encodeURIComponent(describeError(caught))}`);
  }
  revalidatePath("/console/work");
}

export async function declareCash(form: FormData): Promise<void> {
  const id = text(form, "jobId");
  // an attendant just confirms the quote; a supervisor or manager may record a different amount, and must say why
  const amount = shillingsToCents(form, "amount");
  const reason = text(form, "reason");
  try {
    await api.send("POST", `/v1/jobs/${id}/cash`, { ...(amount !== null ? { amountCents: amount } : {}), ...(reason ? { reason } : {}) });
  } catch (caught) {
    redirect(`/console/work?error=${encodeURIComponent(describeError(caught))}`);
  }
  revalidatePath("/console/work");
}


// ---- accounts: my PIN, someone else's PIN ------------------------------------------------------

export interface PinState {
  error: string | null;
  done: boolean;
  /** set once, on a reset: the new PIN, shown to the manager and then gone */
  pin?: string;
}

export async function changeMyPin(_previous: PinState, form: FormData): Promise<PinState> {
  const currentPin = text(form, "currentPin");
  const newPin = text(form, "newPin");
  if (newPin.length < 6) return { error: "Choose a PIN of at least 6 characters.", done: false };
  if (newPin !== text(form, "confirm")) return { error: "The two new PINs are not the same.", done: false };
  const session = await readSession();
  if (!session) return { error: "That session has ended. Sign in again.", done: false };
  try {
    const result = await api.send<{ token: string; expiresInSeconds: number }>("POST", "/v1/me/pin", { currentPin, newPin });
    // every other session of this account is now void; keep this one by taking the fresh token
    await writeSession({ ...session, token: result.token }, result.expiresInSeconds);
  } catch (caught) {
    return { error: describeError(caught), done: false };
  }
  return { error: null, done: true };
}

export async function resetPersonPin(_previous: PinState, form: FormData): Promise<PinState> {
  try {
    const result = await api.send<{ pin: string }>("POST", `/v1/users/${text(form, "id")}/reset-pin`);
    return { error: null, done: true, pin: result.pin };
  } catch (caught) {
    return { error: describeError(caught), done: false };
  }
}

// ---- devices, closing a day, refunds -----------------------------------------------------------

export interface DeviceState {
  error: string | null;
  created: { id: string; secret: string } | null;
}

export async function provisionDevice(_previous: DeviceState, form: FormData): Promise<DeviceState> {
  const siteId = text(form, "siteId");
  const type = text(form, "type");
  const bayId = text(form, "bayId");
  if (!siteId || !type) return { error: "Choose the site and the kind of device.", created: null };
  try {
    const made = await api.send<{ id: string; secret: string }>("POST", "/v1/devices", {
      siteId,
      type,
      ...(bayId ? { bayId } : {}),
      ...(text(form, "firmware") ? { firmware: text(form, "firmware") } : {})
    });
    revalidatePath("/console/devices");
    // returned to the form and shown once; it is stored nowhere on the console
    return { error: null, created: { id: made.id, secret: made.secret } };
  } catch (caught) {
    return { error: describeError(caught), created: null };
  }
}

export async function closeDay(form: FormData): Promise<void> {
  const site = text(form, "siteId");
  const day = text(form, "day");
  try {
    await api.send("POST", "/v1/sites/close", { siteId: site, day });
  } catch (caught) {
    redirect(`/console/report?site=${site}&day=${day}&error=${encodeURIComponent(describeError(caught))}`);
  }
  revalidatePath("/console", "layout");
  redirect(`/console/report?site=${site}&day=${day}`);
}

export async function voidJob(_previous: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "id");
  const reason = text(form, "reason");
  if (reason.length < 5) return { error: "Say why the sale is being reversed (at least a few words)." };
  const failed = await attempt(async () => {
    await api.send("POST", `/v1/jobs/${id}/void`, { reason });
  });
  if (failed) return failed;
  revalidatePath(`/console/jobs/${id}`);
  redirect(`/console/jobs/${id}`);
}
