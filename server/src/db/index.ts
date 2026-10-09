import { env } from "../config/env";
import { MemoryRepository } from "./memoryRepo";
import { SupabaseRepository } from "./supabaseRepo";
import type { Repository } from "./repository";

const memory = new MemoryRepository();

/**
 * Resolve the repository for the current request.
 *
 * - Supabase configured → RLS-scoped client built from the caller's token, so
 *   a user can only ever read/write their own journeys and orders.
 * - Supabase missing    → shared in-memory repository (clearly reported as
 *   demo mode; not a production database).
 */
export function getRepo(token?: string): Repository {
  if (!env.supabase.configured) return memory;
  return new SupabaseRepository(token);
}

/** Read-only repository for public catalogue data (stalls, menus). */
export function getPublicRepo(): Repository {
  return getRepo(undefined);
}

export { MemoryRepository, SupabaseRepository };
export type { Repository };
