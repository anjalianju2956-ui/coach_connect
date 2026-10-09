import type {
  DataSource,
  Journey,
  JourneyStatus,
  MenuItem,
  Profile,
  Station,
  Stall,
} from "../types";

/**
 * Persistence boundary.
 *
 * Two implementations exist:
 *   - `supabaseRepo` — Supabase PostgreSQL (production path, RLS enforced)
 *   - `memoryRepo`   — in-memory fallback used when Supabase credentials are
 *                      missing, so the whole app stays runnable while you
 *                      configure your account. It never claims to be a DB.
 *
 * The rest of the app only talks to this interface, so swapping storage (or
 * adding a Partner-side repository later) does not touch business logic.
 */
export interface Repository {
  readonly kind: "supabase" | "memory";

  getProfile(userId: string): Promise<Profile | null>;
  upsertProfile(input: {
    userId: string;
    phone?: string | null;
    displayName?: string | null;
  }): Promise<Profile>;

  getActiveJourney(userId: string): Promise<Journey | null>;
  getJourney(id: string, userId: string): Promise<Journey | null>;
  createJourney(
    input: Omit<
      Journey,
      "id" | "started_at" | "updated_at" | "ended_at" | "sample_count" | "progress_km"
    > & { progress_km?: number | null },
  ): Promise<Journey>;
  updateJourney(id: string, patch: Partial<Journey>): Promise<Journey>;
  endJourney(id: string, userId: string): Promise<Journey | null>;

  listStalls(options?: { stationCode?: string }): Promise<Stall[]>;
  getStall(id: string): Promise<Stall | null>;
  listMenuItems(stallId: string): Promise<MenuItem[]>;

}

export type { DataSource, Journey, JourneyStatus, MenuItem, Profile, Station, Stall };
