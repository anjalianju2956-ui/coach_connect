import { DEMO_ROUTES, DEMO_ROUTE_HINT } from "../data/demoRoutes";
import { env } from "../config/env";
import { AppError, badRequest, notFound } from "../lib/errors";
import { logger } from "../lib/logger";
import type { LiveTrainData, RouteStation, TrainRoute } from "../types";
import { railkit, todayDdMmYyyy } from "./railkitService";

/**
 * Train route resolution.
 *
 * Flow: RailKit `/trains/:n/info` → normalise → cache → (fallback) demo route.
 * Provider payloads are treated as `unknown` and normalised defensively so a
 * schema change degrades gracefully instead of crashing verification.
 */

const SCOPE = "trainRoute";

const TRAIN_PATTERN = /^\d{5}$/;

export function assertTrainNumber(value: string): string {
  const train = value.trim();
  if (!TRAIN_PATTERN.test(train)) {
    throw badRequest("Train number must be exactly 5 digits (for example 12951).");
  }
  return train;
}

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : null;
}

function asArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ["items", "list", "data"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return null;
}

function str(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return null;
}

function num(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string" && c.trim() !== "" && Number.isFinite(Number(c))) return Number(c);
  }
  return null;
}

function geo(obj: RawRecord | null): { lat: number | null; lng: number | null } {
  if (!obj) return { lat: null, lng: null };
  const nested = asRecord(obj.location) ?? asRecord(obj.coordinates) ?? asRecord(obj.geo);
  const lat = num(obj.lat, obj.latitude, obj.lat_deg, obj.latDeg, nested?.lat, nested?.latitude);
  const lng = num(
    obj.lng,
    obj.lon,
    obj.longitude,
    obj.lng_deg,
    obj.lngDeg,
    nested?.lng,
    nested?.lon,
    nested?.longitude,
  );
  return { lat, lng };
}

function pickStopArray(data: unknown): unknown[] | null {
  const record = asRecord(data);
  if (!record) return asArray(data);
  for (const key of ["route", "stoppages", "stations", "stationList", "schedule", "data"]) {
    const arr = asArray(record[key]);
    if (arr && arr.length > 0) return arr;
  }
  // Common wrapper: { trainInfo: { route: [...] } }
  const trainInfo = asRecord(record.trainInfo) ?? asRecord(record.train) ?? asRecord(record.info);
  if (trainInfo) {
    for (const key of ["route", "stoppages", "stations", "schedule"]) {
      const arr = asArray(trainInfo[key]);
      if (arr && arr.length > 0) return arr;
    }
  }
  return null;
}

function normaliseTime(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normaliseStop(raw: unknown, index: number): RouteStation | null {
  const record = asRecord(raw);
  if (!record) return null;

  const stationWrapper = asRecord(record.station) ?? asRecord(record.stn);
  const code = str(
    record.station_code,
    record.stationCode,
    record.stn_code,
    record.stnCode,
    record.code,
    stationWrapper?.code,
    stationWrapper?.station_code,
  );
  if (!code) return null;

  const coords = geo(record) || geo(stationWrapper);
  const name =
    str(record.station_name, record.stationName, record.stn_name, record.name, stationWrapper?.name) ??
    code;

  return {
    index,
    code: code.toUpperCase(),
    name,
    lat: coords.lat,
    lng: coords.lng,
    scheduledArrival: normaliseTime(
      record.arrival_time ?? record.arrival ?? record.arr ?? record.scheduled_arrival ?? record.sch_arr,
    ),
    scheduledDeparture: normaliseTime(
      record.departure_time ?? record.departure ?? record.dep ?? record.scheduled_departure ?? record.sch_dep,
    ),
    haltMinutes: num(record.halt, record.halt_minutes, record.haltMins, record.stoppage_time),
    distanceFromOriginKm: num(
      record.distance,
      record.distance_from_origin,
      record.dist,
      record.cumulative_distance,
      record.day,
    ),
  };
}

function normaliseRoute(trainNumber: string, payload: unknown): TrainRoute | null {
  const record = asRecord(payload);
  const stopArray = pickStopArray(payload);
  if (!stopArray) return null;

  const stops: RouteStation[] = [];
  for (let i = 0; i < stopArray.length; i += 1) {
    const stop = normaliseStop(stopArray[i], stops.length);
    if (stop) stops.push(stop);
  }
  if (stops.length < 2) return null;

  const trainInfo =
    asRecord(record?.trainInfo) ?? asRecord(record?.train) ?? asRecord(record?.info) ?? record;

  const trainName =
    str(
      trainInfo?.train_name,
      trainInfo?.trainName,
      trainInfo?.name,
      record?.train_name,
      record?.trainName,
    ) ?? `Train ${trainNumber}`;

  const first = stops[0];
  const last = stops[stops.length - 1];

  return {
    trainNumber,
    trainName,
    originCode: first.code,
    destinationCode: last.code,
    stations: stops,
    source: "railkit",
    fetchedAt: new Date().toISOString(),
  };
}

export interface RouteResult {
  route: TrainRoute;
  warnings: string[];
  cached: boolean;
}

function demoLiveSnapshot(trainNumber: string, currentStationCode?: string): LiveTrainData | null {
  const route = DEMO_ROUTES[trainNumber];
  if (!route || route.stations.length < 2) return null;
  const matchedIndex = currentStationCode
    ? route.stations.findIndex((station) => station.code.toUpperCase() === currentStationCode.toUpperCase())
    : 0;
  const currentIndex = Math.min(Math.max(matchedIndex, 0), route.stations.length - 2);
  const current = route.stations[currentIndex];
  const next = route.stations[currentIndex + 1];
  const distance =
    current.distanceFromOriginKm !== null && next.distanceFromOriginKm !== null
      ? Math.max(0, next.distanceFromOriginKm - current.distanceFromOriginKm)
      : null;
  const speedKmph = 55;

  return {
    trainNumber,
    trainName: route.trainName,
    currentLocation: { code: current.code, name: current.name, lat: current.lat, lng: current.lng },
    nextStation: { code: next.code, name: next.name, lat: next.lat, lng: next.lng },
    distanceToNextStationKm: distance,
    delayMinutes: null,
    speedKmph,
    etaMinutes: distance === null ? null : Math.max(1, Math.round((distance / speedKmph) * 60)),
    route: route.stations,
    coachPosition: null,
    source: "DEMO",
    cached: false,
  };
}

/**
 * Resolve the ordered route for a train.
 * Never throws for a *missing* provider: it degrades to demo data when allowed,
 * otherwise returns an actionable error.
 */
export async function getTrainRoute(trainNumber: string): Promise<RouteResult> {
  const train = assertTrainNumber(trainNumber);
  const warnings: string[] = [];
  let railkitError: AppError | null = null;

  if (env.railkit.enabled && env.railkit.configured) {
    try {
      const result = await railkit.trainInfo(train);
      const route = normaliseRoute(train, result.value);
      if (route) return { route, warnings, cached: result.cached };
      warnings.push(
        "RailKit answered for this train but the route payload could not be understood; falling back to local data.",
      );
    } catch (error) {
      railkitError = error as AppError;
      warnings.push(`RailKit train info unavailable (${railkitError.code ?? "ERROR"}): ${railkitError.message}`);
      logger.warn(SCOPE, "train info failed", { train, code: railkitError.code });
    }
  } else if (!env.railkit.enabled) {
    warnings.push("RailKit is disabled (set RAILKIT_ENABLED=true to enable live railway data).");
  } else {
    warnings.push("RAILKIT_API_KEY is not configured.");
  }

  const demo = DEMO_ROUTES[train];
  if (demo && env.rules.enableDemoData) {
    warnings.push(`Using DEMO route data. ${DEMO_ROUTE_HINT}`);
    return { route: { ...demo, fetchedAt: new Date().toISOString() }, warnings, cached: false };
  }

  if (railkitError?.code === "RAILKIT_QUOTA_EXHAUSTED") {
    throw railkitError;
  }

  if (!env.railkit.enabled || !env.railkit.configured) {
    throw new AppError(
      503,
      "RAILKIT_NOT_CONFIGURED",
      `Cannot load route for train ${train}: RailKit must be enabled and configured, and this train is not in the built-in DEMO routes.`,
    );
  }

  throw notFound(`No route information found for train ${train}.`);
}

/** Optional enrichment: live running status for a train on a given date. */
export async function getTrainLive(
  trainNumber: string,
  date = todayDdMmYyyy(),
  currentStationCode?: string,
): Promise<{ payload: LiveTrainData | null; warnings: string[] }> {
  const train = assertTrainNumber(trainNumber);
  if (!env.railkit.enabled) {
    return {
      payload: env.rules.enableDemoData ? demoLiveSnapshot(train, currentStationCode) : null,
      warnings: [
        "RailKit is disabled; live status was not requested.",
        ...(env.rules.enableDemoData && DEMO_ROUTES[train]
          ? ["Using clearly labelled seeded DEMO train data."]
          : []),
      ],
    };
  }
  if (!env.railkit.configured) {
    return {
      payload: env.rules.enableDemoData ? demoLiveSnapshot(train, currentStationCode) : null,
      warnings: [
        "RAILKIT_API_KEY is not configured; live status skipped.",
        ...(env.rules.enableDemoData && DEMO_ROUTES[train]
          ? ["Using clearly labelled seeded DEMO train data."]
          : []),
      ],
    };
  }
  try {
    const result = await railkit.trainLive(train, date);
    return { payload: result.value, warnings: [] };
  } catch (error) {
    const appError = error as AppError;
    logger.warn(SCOPE, "live status failed", { train, code: appError.code });
    const fallback = env.rules.enableDemoData ? demoLiveSnapshot(train, currentStationCode) : null;
    return {
      payload: fallback,
      warnings: [
        `Live status unavailable (${appError.code}).`,
        ...(fallback ? ["Using clearly labelled seeded DEMO train data."] : []),
      ],
    };
  }
}
