import { DEMO_ROUTES } from "../data/demoRoutes";
import { env } from "../config/env";
import { AppError, badRequest, notFound } from "../lib/errors";
import { logger } from "../lib/logger";
import type { RouteStation, Station, TrainRoute } from "../types";
import { railkit } from "./railkitService";

/**
 * Station resolution.
 *
 * RailKit endpoint (documented): GET /api/v1/stations/:stationCode
 * Coordinates for route stops are filled in from this endpoint when the train
 * payload does not include them — without coordinates there is no corridor
 * check and therefore no honest journey verification.
 */

const SCOPE = "station";
const STATION_PATTERN = /^[A-Z]{2,6}$/;

export function assertStationCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!STATION_PATTERN.test(code)) {
    throw badRequest("Station code must be 2–6 letters (for example NDLS, MMCT, KOTA).");
  }
  return code;
}

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

export function normaliseStation(payload: unknown, fallbackCode: string): Station | null {
  const record = asRecord(payload);
  if (!record) return null;

  const nested = asRecord(record.location) ?? asRecord(record.coordinates) ?? asRecord(record.geo);
  const code = firstString(
    record.code,
    record.station_code,
    record.stationCode,
    record.stn_code,
    fallbackCode,
  );
  const name = firstString(record.name, record.station_name, record.stationName, code);
  if (!code) return null;

  return {
    code: code.toUpperCase(),
    name: name ?? code.toUpperCase(),
    lat: firstNumber(record.lat, record.latitude, record.lat_deg, nested?.lat, nested?.latitude),
    lng: firstNumber(
      record.lng,
      record.lon,
      record.longitude,
      record.lng_deg,
      nested?.lng,
      nested?.lon,
      nested?.longitude,
    ),
    state: firstString(record.state, record.state_name),
    source: "railkit",
  };
}

function demoStation(code: string): Station | null {
  for (const route of Object.values(DEMO_ROUTES)) {
    const stop = route.stations.find((s) => s.code === code);
    if (stop) {
      return {
        code: stop.code,
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        state: null,
        source: "demo",
      };
    }
  }
  return null;
}

export interface StationResult {
  station: Station;
  warnings: string[];
}

export async function getStation(stationCode: string): Promise<StationResult> {
  const code = assertStationCode(stationCode);
  const warnings: string[] = [];

  if (env.railkit.enabled && env.railkit.configured) {
    try {
      const result = await railkit.stationByCode(code);
      const station = normaliseStation(result.value, code);
      if (station) return { station, warnings };
      warnings.push("RailKit answered but the station payload could not be parsed.");
    } catch (error) {
      const appError = error as AppError;
      warnings.push(`RailKit station lookup failed (${appError.code}).`);
      logger.warn(SCOPE, "station lookup failed", { code, code_: appError.code });
      if (appError.code === "RAILKIT_QUOTA_EXHAUSTED") {
        const demo = env.rules.enableDemoData ? demoStation(code) : null;
        if (!demo) throw appError;
      }
    }
  } else if (!env.railkit.enabled) {
    warnings.push("RailKit is disabled (set RAILKIT_ENABLED=true to enable live railway data).");
  } else {
    warnings.push("RAILKIT_API_KEY is not configured.");
  }

  const demo = env.rules.enableDemoData ? demoStation(code) : null;
  if (demo) {
    warnings.push("Using DEMO station data (approximate coordinates).");
    return { station: demo, warnings };
  }

  throw notFound(`Station ${code} could not be resolved.`);
}

/**
 * Fill missing coordinates on a route using the station endpoint.
 * Bounded so a bad payload can never trigger hundreds of upstream calls.
 */
export async function ensureRouteCoordinates(
  route: TrainRoute,
): Promise<{ route: TrainRoute; warnings: string[] }> {
  const warnings: string[] = [];
  const missing = route.stations.filter((s) => s.lat === null || s.lng === null);
  if (missing.length === 0) return { route, warnings };

  const MAX_LOOKUPS = 6;
  const unresolved: RouteStation[] = [];
  const resolved = new Map<string, Station>();
  for (const stop of missing) {
    const demo = env.rules.enableDemoData ? demoStation(stop.code) : null;
    if (demo && demo.lat !== null && demo.lng !== null) {
      resolved.set(stop.code, demo);
    } else {
      unresolved.push(stop);
    }
  }

  if (!env.railkit.enabled || !env.railkit.configured || unresolved.length === 0) {
    const stations = route.stations.map((stop) => {
      const station = resolved.get(stop.code);
      if (!station) return stop;
      return { ...stop, lat: station.lat, lng: station.lng };
    });
    return { route: { ...route, stations }, warnings };
  }

  const toLookup = unresolved.slice(0, MAX_LOOKUPS);
  if (unresolved.length > MAX_LOOKUPS) {
    warnings.push(
      `${unresolved.length} stops lack coordinates; only ${MAX_LOOKUPS} were resolved this request.`,
    );
  }

  for (const stop of toLookup) {
    try {
      const result = await railkit.stationByCode(stop.code);
      const station = normaliseStation(result.value, stop.code);
      if (station && station.lat !== null && station.lng !== null) resolved.set(stop.code, station);
    } catch (error) {
      if ((error as AppError).code === "RAILKIT_QUOTA_EXHAUSTED") throw error;
      warnings.push(`Coordinates unavailable for ${stop.code}.`);
    }
  }

  if (resolved.size === 0) return { route, warnings };

  const stations: RouteStation[] = route.stations.map((stop) => {
    const station = resolved.get(stop.code);
    if (!station || station.lat === null || station.lng === null) return stop;
    return { ...stop, lat: station.lat, lng: station.lng };
  });

  return { route: { ...route, stations }, warnings };
}
