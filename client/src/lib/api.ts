import type { ApiResponse } from "../types";

/**
 * Thin fetch wrapper for the Coach-Connect API.
 *
 * - Always speaks the backend envelope: { ok, data } | { ok:false, error }
 * - Sends the Supabase access token when there is a session
 * - Never contains secrets: only VITE_* values reach the browser
 */

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").trim();
export const API_BASE = `${RAW_BASE.replace(/\/+$/, "")}/api`;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let authToken: string | null = null;

/** Set by AuthContext whenever the Supabase session changes. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Could not reach the Coach-Connect server. Is the backend running?",
    );
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE", "The server returned an unreadable response.");
  }

  if (!payload.ok) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? "UNKNOWN_ERROR",
      payload.error?.message ?? "Something went wrong.",
      payload.error?.details,
    );
  }

  return payload.data;
}

/* --------------------------- convenience calls --------------------------- */

export const apiGet = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
