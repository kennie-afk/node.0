import { readSession } from "@/lib/session";

const API = process.env.FORECOURT_API_URL ?? "http://127.0.0.1:4000";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      detail = response.statusText;
    }
    throw new ApiError(response.status, detail);
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
    )
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "That session has expired. Sign out on the left, then sign in again.";
    }
    return error.message;
  }
  if (error instanceof Error && error.message.includes("fetch failed")) {
    return `The Forecourt API is not reachable at ${API}. Start it with npm start in projects/carwash.`;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
