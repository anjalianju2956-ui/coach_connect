import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import { configError } from "../lib/errors";

/**
 * Supabase access.
 *
 * - `requireSupabase()`   → throws a clear, actionable 503 when not configured.
 * - `anonClient()`        → public, non-authenticated reads (stalls, menus).
 * - `userClient(token)`   → RLS-scoped client: Postgres only ever returns/accepts
 *                           rows belonging to that user.
 * - `adminClient()`       → only when a service-role key is configured; never
 *                           exposed to the browser and never used for user data
 *                           unless the request has already been authorised.
 *
 * The RailKit key is unrelated to Supabase and must never be sent here.
 */

export function requireSupabase(): void {
  if (!env.supabase.configured) {
    throw configError(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in your .env (see .env.example), then restart the server.",
    );
  }
}

let anon: SupabaseClient | null = null;

export function anonClient(): SupabaseClient {
  requireSupabase();
  if (!anon) {
    anon = createClient(env.supabase.url, env.supabase.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anon;
}

export function userClient(token: string): SupabaseClient {
  requireSupabase();
  return createClient(env.supabase.url, env.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let admin: SupabaseClient | null = null;

export function adminClient(): SupabaseClient | null {
  if (!env.supabase.configured || !env.supabase.serviceRoleKey) return null;
  if (!admin) {
    admin = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

/** Resolve the authenticated user for a bearer token, or null when invalid. */
export async function resolveUserFromToken(
  token: string,
): Promise<{ id: string; phone?: string } | null> {
  if (!env.supabase.configured) return null;
  try {
    const { data, error } = await anonClient().auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, phone: data.user.phone ?? undefined };
  } catch {
    return null;
  }
}
