"use server";

import { redirect } from "next/navigation";
import { api, describeError } from "@/lib/api";
import { clearSession, writeSession } from "@/lib/session";

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
