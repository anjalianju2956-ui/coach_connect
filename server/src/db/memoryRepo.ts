import { randomUUID } from "crypto";
import type { Journey, MenuItem, Profile, Stall } from "../types";
import type { Repository } from "./repository";

/**
 * In-memory repository.
 *
 * Used ONLY when Supabase credentials are not configured, so you can run the
 * whole passenger flow locally before creating an account. Data disappears on
 * restart and is clearly reported as demo mode through /api/health.
 */

const nowIso = () => new Date().toISOString();

function journeyClock(input: Partial<Journey>): Pick<Journey, "started_at" | "updated_at" | "ended_at" | "sample_count"> {
  return {
    started_at: input.started_at ?? nowIso(),
    updated_at: nowIso(),
    ended_at: input.ended_at ?? null,
    sample_count: input.sample_count ?? 1,
  };
}

export class MemoryRepository implements Repository {
  readonly kind = "memory" as const;

  private profiles = new Map<string, Profile>();
  private journeys = new Map<string, Journey>();
  private stalls = new Map<string, Stall>();
  private menus = new Map<string, MenuItem[]>();

  async getProfile(userId: string): Promise<Profile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async upsertProfile(input: {
    userId: string;
    phone?: string | null;
    displayName?: string | null;
  }): Promise<Profile> {
    const existing = this.profiles.get(input.userId);
    const profile: Profile = {
      id: existing?.id ?? randomUUID(),
      user_id: input.userId,
      phone: input.phone ?? existing?.phone ?? null,
      display_name: input.displayName ?? existing?.display_name ?? null,
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso(),
    };
    this.profiles.set(input.userId, profile);
    return profile;
  }

  async getActiveJourney(userId: string): Promise<Journey | null> {
    const list = [...this.journeys.values()]
      .filter((j) => j.user_id === userId && j.status === "ACTIVE")
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return list[0] ?? null;
  }

  async getJourney(id: string, userId: string): Promise<Journey | null> {
    const journey = this.journeys.get(id);
    if (!journey || journey.user_id !== userId) return null;
    return journey;
  }

  async createJourney(
    input: Omit<
      Journey,
      "id" | "started_at" | "updated_at" | "ended_at" | "sample_count" | "progress_km"
    > & { progress_km?: number | null },
  ): Promise<Journey> {
    const id = randomUUID();
    const journey: Journey = {
      ...input,
      id,
      progress_km: input.progress_km ?? null,
      last_seen_at: input.last_seen_at ?? null,
      sample_count: 1,
      started_at: nowIso(),
      updated_at: nowIso(),
      ended_at: null,
    };
    this.journeys.set(id, journey);
    return journey;
  }

  async updateJourney(id: string, patch: Partial<Journey>): Promise<Journey> {
    const existing = this.journeys.get(id);
    if (!existing) throw new Error(`Journey ${id} not found`);
    const merged: Journey = { ...existing, ...patch, id, updated_at: nowIso() };
    this.journeys.set(id, merged);
    return merged;
  }

  async endJourney(id: string, userId: string): Promise<Journey | null> {
    const existing = this.journeys.get(id);
    if (!existing || existing.user_id !== userId) return null;
    const merged: Journey = { ...existing, status: "ENDED", ended_at: nowIso(), updated_at: nowIso() };
    this.journeys.set(id, merged);
    return merged;
  }

  async listStalls(): Promise<Stall[]> {
    return [...this.stalls.values()].filter((s) => s.is_active);
  }

  async getStall(id: string): Promise<Stall | null> {
    return this.stalls.get(id) ?? null;
  }

  async listMenuItems(stallId: string): Promise<MenuItem[]> {
    return this.menus.get(stallId) ?? [];
  }
}
