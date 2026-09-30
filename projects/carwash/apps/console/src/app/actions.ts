"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, describeError } from "@/lib/api";
import { clearSession, writeSession } from "@/lib/session";
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

  try {
    const result = await api.login({ phone, pin });
    await writeSession(
      { token: result.token, displayName: result.displayName, role: result.role },
      result.expiresInSeconds
    );
  } catch (caught) {
    return { error: describeError(caught) };
  }

  redirect("/console");
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect("/login");
}

export interface SignupState {
  error: string | null;
  done: boolean;
}

export async function requestSignup(
  _previous: SignupState,
  form: FormData
): Promise<SignupState> {
  const businessName = String(form.get("businessName") ?? "").trim();
  const contactName = String(form.get("contactName") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const siteCountRaw = String(form.get("siteCount") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();

  if (!businessName || !contactName || !phone) {
    return { error: "Business name, your name and phone number are required.", done: false };
  }

  const siteCount = siteCountRaw ? Number.parseInt(siteCountRaw, 10) : undefined;

  try {
    await api.signup({
      businessName,
      contactName,
      phone,
      siteCount: siteCount && Number.isFinite(siteCount) ? siteCount : undefined,
      notes: notes || undefined
    });
  } catch (caught) {
    return { error: describeError(caught), done: false };
  }

  return { error: null, done: true };
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

export async function saveService(_previous: FormState, form: FormData): Promise<FormState> {
  const price = shillingsToCents(form, "price");
  const water = number(form, "water");
  const minutes = number(form, "minutes");
  const commission = number(form, "commission");
  if (price === null || price < 0) return { error: "Enter the price in shillings, for example 500." };
  if ([water, minutes, commission].some((value) => value !== null && Number.isNaN(value))) {
    return { error: "Water, minutes and commission must be numbers." };
  }
  const body = {
    name: text(form, "name"),
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
