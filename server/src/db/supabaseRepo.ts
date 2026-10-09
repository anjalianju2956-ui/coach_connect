import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, userClient } from "../config/supabase";
import { AppError, upstreamError } from "../lib/errors";
import type {
  Journey,
  MenuItem,
  Profile,
  Stall,
} from "../types";
import type { Repository } from "./repository";

/* ------------------------------- row shapes ------------------------------- */

interface ProfileRow {
  id: string;
  user_id: string;
  phone: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

interface JourneyRow {
  id: string;
  user_id: string;
  train_number: string;
  train_name: string | null;
  coach: string;
  status: Journey["status"];
  verified: boolean;
  confidence: number;
  current_station_code: string | null;
  current_station_name: string | null;
  next_station_code: string | null;
  next_station_name: string | null;
  progress_km: number | null;
  direction: number;
  last_lat: number | null;
  last_lng: number | null;
  last_speed_kmph: number | null;
  last_seen_at: string | null;
  sample_count: number;
  route_source: string | null;
  verify_reason: string | null;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
}

interface StallRow {
  id: string;
  stall_name: string;
  description: string | null;
  station_code: string;
  station_name: string;
  platform: string | null;
  latitude: number | null;
  longitude: number | null;
  service_radius: number;
  phone: string | null;
  image_url: string | null;
  is_active: boolean;
  opening_time: string | null;
  closing_time: string | null;
  rating: number | null;
  prep_time_minutes: number | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

interface MenuItemRow {
  id: string;
  stall_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  category: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

/* -------------------------------- helpers -------------------------------- */

function unwrap<T>(payload: { data: T | null; error: { message: string } | null }, label: string): T {
  if (payload.error) {
    throw upstreamError(`${label} failed: ${payload.error.message}`);
  }
  return payload.data as T;
}

const toProfile = (row: ProfileRow): Profile => row;
const toStall = (row: StallRow): Stall => row;
const toMenuItem = (row: MenuItemRow): MenuItem => row;

const toJourney = (row: JourneyRow): Journey => ({
  ...row,
  direction: (row.direction === -1 ? -1 : 1) as 1 | -1,
  route_source: (row.route_source ?? null) as Journey["route_source"],
  status: row.status === "ENDED" ? "ENDED" : "ACTIVE",
});

/* ------------------------------ repository ------------------------------- */

export class SupabaseRepository implements Repository {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(token?: string) {
    this.db = token ? userClient(token) : anonClient();
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.db
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw upstreamError(`profiles read failed: ${error.message}`);
    return data ? toProfile(data as ProfileRow) : null;
  }

  async upsertProfile(input: {
    userId: string;
    phone?: string | null;
    displayName?: string | null;
  }): Promise<Profile> {
    const row = {
      user_id: input.userId,
      phone: input.phone ?? null,
      display_name: input.displayName ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await this.db
      .from("profiles")
      .upsert(row, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw upstreamError(`profile save failed: ${error.message}`);
    return toProfile(data as ProfileRow);
  }

  async getActiveJourney(userId: string): Promise<Journey | null> {
    const { data, error } = await this.db
      .from("journeys")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw upstreamError(`journey read failed: ${error.message}`);
    return data ? toJourney(data as JourneyRow) : null;
  }

  async getJourney(id: string, userId: string): Promise<Journey | null> {
    const { data, error } = await this.db
      .from("journeys")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw upstreamError(`journey read failed: ${error.message}`);
    return data ? toJourney(data as JourneyRow) : null;
  }

  async createJourney(
    input: Omit<
      Journey,
      "id" | "started_at" | "updated_at" | "ended_at" | "sample_count" | "progress_km"
    > & { progress_km?: number | null },
  ): Promise<Journey> {
    const row = {
      user_id: input.user_id,
      train_number: input.train_number,
      train_name: input.train_name,
      coach: input.coach,
      status: input.status,
      verified: input.verified,
      confidence: input.confidence,
      current_station_code: input.current_station_code,
      current_station_name: input.current_station_name,
      next_station_code: input.next_station_code,
      next_station_name: input.next_station_name,
      progress_km: input.progress_km ?? null,
      direction: input.direction,
      last_lat: input.last_lat,
      last_lng: input.last_lng,
      last_speed_kmph: input.last_speed_kmph,
      last_seen_at: input.last_seen_at,
      sample_count: 1,
      route_source: input.route_source,
      verify_reason: input.verify_reason,
    };
    const { data, error } = await this.db.from("journeys").insert(row).select().single();
    if (error) throw upstreamError(`journey create failed: ${error.message}`);
    return toJourney(data as JourneyRow);
  }

  async updateJourney(id: string, patch: Partial<Journey>): Promise<Journey> {
    const allowed: Record<string, unknown> = {};
    const keys: Array<keyof Journey> = [
      "verified",
      "confidence",
      "current_station_code",
      "current_station_name",
      "next_station_code",
      "next_station_name",
      "progress_km",
      "direction",
      "last_lat",
      "last_lng",
      "last_speed_kmph",
      "last_seen_at",
      "sample_count",
      "route_source",
      "verify_reason",
      "status",
      "train_name",
      "coach",
      "ended_at",
    ];
    for (const key of keys) {
      if (key in patch) allowed[key] = patch[key];
    }
    allowed.updated_at = new Date().toISOString();
    const { data, error } = await this.db
      .from("journeys")
      .update(allowed)
      .eq("id", id)
      .select()
      .single();
    if (error) throw upstreamError(`journey update failed: ${error.message}`);
    return toJourney(data as JourneyRow);
  }

  async endJourney(id: string, userId: string): Promise<Journey | null> {
    const { data, error } = await this.db
      .from("journeys")
      .update({ status: "ENDED", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw upstreamError(`journey end failed: ${error.message}`);
    return data ? toJourney(data as JourneyRow) : null;
  }

  async listStalls(options?: { stationCode?: string }): Promise<Stall[]> {
    let query = this.db.from("stalls").select("*").eq("is_active", true);
    if (options?.stationCode) query = query.eq("station_code", options.stationCode.toUpperCase());
    const { data, error } = await query.order("stall_name", { ascending: true });
    if (error) throw upstreamError(`stalls read failed: ${error.message}`);
    return ((data ?? []) as StallRow[]).map(toStall);
  }

  async getStall(id: string): Promise<Stall | null> {
    const { data, error } = await this.db.from("stalls").select("*").eq("id", id).maybeSingle();
    if (error) throw upstreamError(`stall read failed: ${error.message}`);
    return data ? toStall(data as StallRow) : null;
  }

  async listMenuItems(stallId: string): Promise<MenuItem[]> {
    const { data, error } = await this.db
      .from("menu_items")
      .select("*")
      .eq("stall_id", stallId)
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw upstreamError(`menu read failed: ${error.message}`);
    return ((data ?? []) as MenuItemRow[]).map(toMenuItem);
  }
}
