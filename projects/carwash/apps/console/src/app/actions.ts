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

  redirect("/");
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect("/login");
}
