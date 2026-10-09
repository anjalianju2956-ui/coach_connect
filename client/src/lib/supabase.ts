import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase browser client.
 *
 * The anon key is publishable by design — the REAL protection is Row Level
 * Security (see supabase/migrations/0002_rls_policies.sql).
 * The RailKit key must never appear here.
 */

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export function supabaseConfigured(): boolean {
  return Boolean(
    url &&
      anonKey &&
      !/^YOUR_/i.test(url) &&
      !/^YOUR_/i.test(anonKey),
  );
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
