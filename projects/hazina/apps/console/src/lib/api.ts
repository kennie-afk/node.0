import { cache } from "react";
import { readSession } from "@/lib/session";

export const API = process.env.HAZINA_API_URL ?? "http://127.0.0.1:4300";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;
  constructor(status: number, message: string, code: string | null, requestId: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const bearer = token ?? (await readSession())?.token;
  const response = await fetch(`${API}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Accept: "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(init?.headers ?? {}) }
  });
  if (!response.ok) {
    let failure: { code?: string; message?: string; requestId?: string } = {};
    try {
      failure = await response.json();
    } catch {
      failure = {};
    }
    throw new ApiError(response.status, failure.message ?? response.statusText, failure.code ?? null, failure.requestId ?? null);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") ?? "";
  return (type.includes("json") ? await response.json() : await response.text()) as T;
}

export interface LoginResult { token: string; displayName: string; role: string; expiresInSeconds: number; branchId: string | null }
export interface SignupResult { id: string; status: string; delivery: "sent" | "logged" | "failed"; expiresInMinutes: number }
export interface VerifyResult extends LoginResult { orgId: string }
export interface Pricing {
  currency: string; trialDays: number; provisional: boolean;
  sacco: { smallCents: number; smallMaxMembers: number; mediumCents: number; mediumMaxMembers: number; extraPer1000Cents: number };
  lender: { cents: number; includedBorrowers: number; extraPer1000Cents: number };
}

export const FALLBACK_PRICING: Pricing = {
  currency: "KES", trialDays: 14, provisional: true,
  sacco: { smallCents: 350_000, smallMaxMembers: 500, mediumCents: 600_000, mediumMaxMembers: 3000, extraPer1000Cents: 100_000 },
  lender: { cents: 1_000_000, includedBorrowers: 2000, extraPer1000Cents: 200_000 }
};

/** The layout and the page both ask for the same few things (settings, billing, onboarding); within one render they ask once. */
const cachedGet = cache(async (path: string): Promise<unknown> => request<unknown>(path));

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  pricing: () => request<Pricing>("/v1/pricing", undefined, "").catch(() => FALLBACK_PRICING),
  get: <T>(path: string) => cachedGet(path) as Promise<T>,
  send: <T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) =>
    request<T>(path, { method, ...(body === undefined ? {} : json(body)) }),
  login: (credentials: { phone: string; pin: string }) => request<LoginResult>("/v1/auth/login", { method: "POST", ...json(credentials) }, ""),
  signup: (body: { businessName: string; contactName: string; phone: string; kind: "sacco" | "lender"; expectedMembers?: number; registrationNo?: string; sample?: boolean }) => request<SignupResult>("/v1/signup", { method: "POST", ...json(body) }, ""),
  verifySignup: (body: { id: string; code: string; pin: string }) => request<VerifyResult>("/v1/signup/verify", { method: "POST", ...json(body) }, ""),
  resendCode: (id: string) => request<SignupResult>("/v1/signup/resend", { method: "POST", ...json({ id }) }, "")
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "That session has expired or the details were not right. Sign in again.";
    if (error.status === 429) return "Too many attempts. Wait a few minutes and try again.";
    return error.message;
  }
  if (error instanceof Error && error.message.includes("fetch failed")) return `The Hazina API is not reachable at ${API}.`;
  return error instanceof Error ? error.message : "Something went wrong.";
}
