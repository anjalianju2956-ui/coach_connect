import { DEMO_STALLS, demoMenuItems } from "../data/demoStalls";
import { env } from "../config/env";
import { haversineMeters } from "../lib/geo";
import { isWithinWindow, minutesOfDayLocal, parseHhMm } from "../lib/time";
import type { MenuItem, Stall, StallMatch } from "../types";
import { getPublicRepo } from "../db";

/**
 * Stall discovery + coach-aware ranking (Phase 9 / section 14).
 *
 * Honest by design: we do NOT know where inside a platform a particular coach
 * stops. Distances are straight-line and platform matching is only attempted
 * when the train's platform at that station is actually known. Everything the
 * API returns is flagged so the UI can label it "approximate".
 */

const DISTANCE_WEIGHT = 0.55;
const OPEN_WEIGHT = 0.25;
const RATING_WEIGHT = 0.1;
const PLATFORM_WEIGHT = 0.1;

export interface StallContext {
  lat?: number | null;
  lng?: number | null;
  coach?: string | null;
  /** Platform of the train at this station, when railway data provides it. */
  trainPlatform?: string | null;
  nowMs?: number;
}

function demoStallFor(stationCode: string): Stall[] {
  if (!env.rules.enableDemoData) return [];
  const code = stationCode.toUpperCase();
  return DEMO_STALLS.filter((s) => s.station_code === code);
}

async function loadStallsForStation(stationCode: string): Promise<Stall[]> {
  const code = stationCode.toUpperCase();
  const repo = getPublicRepo();
  try {
    const rows = await repo.listStalls({ stationCode: code });
    if (rows.length > 0) return rows;
  } catch {
    // fall through to demo data — a DB hiccup must not blank the screen
  }
  return demoStallFor(code);
}

async function loadStall(stallId: string): Promise<Stall | null> {
  const repo = getPublicRepo();
  try {
    const row = await repo.getStall(stallId);
    if (row) return row;
  } catch {
    /* fall through */
  }
  if (env.rules.enableDemoData) {
    return DEMO_STALLS.find((s) => s.id === stallId) ?? null;
  }
  return null;
}

async function loadMenu(stallId: string): Promise<MenuItem[]> {
  const repo = getPublicRepo();
  try {
    const rows = await repo.listMenuItems(stallId);
    if (rows.length > 0) return rows;
  } catch {
    /* fall through */
  }
  if (env.rules.enableDemoData) {
    return demoMenuItems().filter((m) => m.stall_id === stallId);
  }
  return [];
}

function distanceToStall(stall: Stall, ctx: StallContext): number | null {
  if (
    typeof ctx.lat !== "number" ||
    typeof ctx.lng !== "number" ||
    typeof stall.latitude !== "number" ||
    typeof stall.longitude !== "number"
  ) {
    return null;
  }
  return haversineMeters({ lat: ctx.lat, lng: ctx.lng }, { lat: stall.latitude, lng: stall.longitude });
}

function isOpenNow(stall: Stall, nowMs: number): boolean {
  return isWithinWindow(
    minutesOfDayLocal(nowMs),
    parseHhMm(stall.opening_time),
    parseHhMm(stall.closing_time),
  );
}

function interpolate(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i += 1) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + (ys[i + 1] - ys[i]) * t;
    }
  }
  return 0;
}

export function rankStall(stall: Stall, ctx: StallContext): StallMatch {
  const now = ctx.nowMs ?? Date.now();
  const distanceM = distanceToStall(stall, ctx);
  const openNow = isOpenNow(stall, now);

  const distanceScore =
    distanceM === null ? 0.5 : interpolate(distanceM, [0, 150, 400, 900, 1600], [1, 0.85, 0.6, 0.3, 0.05]);
  const ratingScore = stall.rating === null ? 0.5 : Math.min(1, Math.max(0, stall.rating / 5));
  const platformMatch =
    ctx.trainPlatform && stall.platform
      ? normalisePlatform(ctx.trainPlatform) === normalisePlatform(stall.platform)
      : null;

  const scores = [distanceScore * DISTANCE_WEIGHT, (openNow ? 1 : 0.3) * OPEN_WEIGHT, ratingScore * RATING_WEIGHT];
  let weightSum = DISTANCE_WEIGHT + OPEN_WEIGHT + RATING_WEIGHT;
  if (platformMatch !== null) {
    scores.push((platformMatch ? 1 : 0.2) * PLATFORM_WEIGHT);
    weightSum += PLATFORM_WEIGHT;
  }
  const score = scores.reduce((a, b) => a + b, 0) / weightSum;

  const reasons: string[] = [];
  if (openNow) reasons.push("Open now");
  else
    reasons.push(
      `Closed — opens ${stall.opening_time ?? "later"}`,
    );
  if (distanceM !== null) reasons.push(`${formatDistance(distanceM)} from you (approximate)`);
  if (platformMatch === true) reasons.push(`Platform ${stall.platform} — matches your train (approximate)`);
  if (stall.rating !== null) reasons.push(`Rated ${stall.rating.toFixed(1)} / 5`);

  return {
    stall,
    distance_meters: distanceM === null ? null : Math.round(distanceM),
    distance_note:
      distanceM === null
        ? "Distance unavailable — stall coordinates missing."
        : "Approximate straight-line distance. Coach-to-platform position is not mapped yet.",
    score: Number(score.toFixed(3)),
    open_now: openNow,
    platform_match: platformMatch,
    reasons,
  };
}

function normalisePlatform(value: string): string {
  return value.replace(/^(pf|platform)\s*/i, "").trim().toUpperCase();
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  if (meters >= 100) return `${Math.round(meters / 10) * 10} m`;
  return `${Math.round(meters)} m`;
}

export async function listStallsForStation(
  stationCode: string,
  ctx: StallContext = {},
): Promise<{ matches: StallMatch[]; warnings: string[] }> {
  const stalls = await loadStallsForStation(stationCode);
  const warnings: string[] = [];

  if (stalls.length === 0) {
    warnings.push(
      env.rules.enableDemoData
        ? `No stalls registered for ${stationCode.toUpperCase()} yet.`
        : "Demo data is disabled and no stalls are seeded for this station.",
    );
    return { matches: [], warnings };
  }

  if (stalls.some((s) => s.is_demo)) {
    warnings.push("DEMO DATA — these stalls are seeded examples, not real partner listings.");
  }
  if (ctx.trainPlatform === null || ctx.trainPlatform === undefined) {
    warnings.push("Train-to-platform mapping unavailable; platform filtering skipped.");
  }

  const matches = stalls.map((stall) => rankStall(stall, ctx));
  matches.sort((a, b) => b.score - a.score);
  return { matches, warnings };
}

export async function getStallDetail(
  stallId: string,
  ctx: StallContext = {},
): Promise<{ match: StallMatch; warnings: string[] } | null> {
  const stall = await loadStall(stallId);
  if (!stall) return null;
  const warnings: string[] = [];
  if (stall.is_demo) warnings.push("DEMO DATA — seeded example stall.");
  return { match: rankStall(stall, ctx), warnings };
}

export async function getMenuForStall(stallId: string): Promise<MenuItem[]> {
  return loadMenu(stallId);
}

export async function getStallById(stallId: string): Promise<Stall | null> {
  return loadStall(stallId);
}
