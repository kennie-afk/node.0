/**
 * Typed wrappers over axios for the feature modules. Every call returns the response body; a
 * failure throws an {@link ApiError} with the backend's message, field errors and request id, so
 * screens never unpick axios errors themselves.
 */
import axios, { type AxiosRequestConfig } from 'axios';
import axiosInstance from './axiosInstance';

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  fields: FieldIssue[];
  requestId?: string;

  constructor(message: string, status: number, fields: FieldIssue[] = [], requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
    this.requestId = requestId;
  }

  /** The message for one form field, if the server named it. */
  fieldMessage(field: string): string | undefined {
    return this.fields.find((issue) => issue.field === field || issue.field.endsWith(`.${field}`))?.message;
  }
}

interface Failure {
  message?: string;
  errors?: FieldIssue[];
  requestId?: string;
}

/** Turns anything thrown by a request into an ApiError ({message, errors[], requestId}). */
export function normalizeError(error: unknown, fallback = 'Something went wrong. Try again.'): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return new ApiError('The server could not be reached. Check your connection and try again.', 0);
    }
    const body = error.response.data as Failure | undefined;
    const fields = Array.isArray(body?.errors) ? body!.errors! : [];
    const message =
      body?.message ??
      (fields.length > 0
        ? fields.map((issue) => `${issue.field}: ${issue.message}`).join('. ')
        : error.response.status === 401
          ? 'Your session has expired. Sign in again.'
          : error.response.status === 403
            ? 'You do not have permission to do that.'
            : error.response.status === 429
              ? 'Too many requests. Wait a moment and try again.'
              : fallback);
    return new ApiError(message, error.response.status, fields, body?.requestId);
  }
  return new ApiError(error instanceof Error && error.message ? error.message : fallback, 0);
}

/** A fresh key for an Idempotency-Key header (8-80 chars of [A-Za-z0-9_-:.] as the API requires). */
export function newIdempotencyKey(prefix = 'ui'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${random}`.slice(0, 80);
}

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await axiosInstance.request<T>(config);
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

/** Drops empty values so a cleared filter is simply absent from the query string. */
export function cleanQuery(query?: Query): Record<string, string | number | boolean> | undefined {
  if (!query) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

export const http = {
  get: <T>(url: string, query?: Query, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'GET', url, params: cleanQuery(query) }),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data: body }),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PUT', url, data: body }),
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PATCH', url, data: body }),
  delete: <T = void>(url: string, config?: AxiosRequestConfig) => request<T>({ ...config, method: 'DELETE', url }),
  /**
   * POST that is safe to retry: the same key is sent on every attempt of one user action. Create
   * the key once per form submission (useRef) and pass it in, so a double click or a retry after a
   * timeout cannot post the money twice.
   */
  postIdempotent: <T>(url: string, body: unknown, key: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data: body, headers: { ...(config?.headers ?? {}), 'Idempotency-Key': key } })
};

export interface KeysetPage<T> {
  data: T[];
  nextCursor: string | null;
  limit: number;
}
