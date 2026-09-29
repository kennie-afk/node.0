import { readSession } from "@/lib/session";

const API = process.env.FORECOURT_API_URL ?? "http://127.0.0.1:4000";

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

interface ApiFailure {
  code?: string;
  message?: string;
  requestId?: string;
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const bearer = token ?? (await readSession())?.token;

  const response = await fetch(`${API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let failure: ApiFailure = {};
    try {
      failure = (await response.json()) as ApiFailure;
    } catch {
      failure = {};
    }
    throw new ApiError(
      response.status,
      failure.message ?? response.statusText,
      failure.code ?? null,
      failure.requestId ?? null
    );
  }

  return (await response.json()) as T;
}

export interface Credentials {
  phone: string;
  pin: string;
}

export interface LoginResult {
  token: string;
  displayName: string;
  role: string;
  expiresInSeconds: number;
}

export interface SignupRequest {
  businessName: string;
  contactName: string;
  phone: string;
  siteCount?: number;
  notes?: string;
}

export interface SignupResult {
  id: string;
  status: string;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string) => request<T>(path, { method: "POST" }),
  login: (credentials: Credentials) =>
    request<LoginResult>(
      "/v1/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials)
      },
      ""
    ),
  signup: (signup: SignupRequest) =>
    request<SignupResult>(
      "/v1/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signup)
      },
      ""
    )
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "That session has expired. Sign out on the left, then sign in again.";
    }
    if (error.status === 429) {
      return "Too many attempts. Wait a few minutes and try again.";
    }
    return error.requestId ? `${error.message} (reference ${error.requestId})` : error.message;
  }
  if (error instanceof Error && error.message.includes("fetch failed")) {
    return `The Forecourt API is not reachable at ${API}. Start it with npm start in projects/carwash.`;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
