import fs from "node:fs";
import path from "node:path";
import type * as RailKitSdk from "railkit";
import { env } from "../config/env";
import { AppError, configError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { LiveTrainData, LiveTrainStation } from "../types";

/**
 * RailKit SDK adapter.
 *
 * The API key is configured server-side and never sent to the browser. SDK
 * responses are treated as `unknown` and normalised defensively downstream.
 */

const SCOPE = "railkit";
const SENSITIVE_FIELD = /(api[_-]?key|authorization|auth|bearer|token|secret|password|credential|private[_-]?key)/i;
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<typeof RailKitSdk>;

interface CacheEntry {
  value: unknown;
  expires: number;
}

export interface RailKitResult<T> {
  value: T;
  cached: boolean;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RailKitResult<unknown>>>();
const usageFilePath = path.resolve(__dirname, "..", "..", ".railkit-usage.json");
let sdkPromise: Promise<typeof RailKitSdk> | undefined;
let sdkConfigured = false;

interface PersistedUsage {
  month: string;
  used: number;
}

function loadUsage(): PersistedUsage {
  let contents: string;
  try {
    contents = fs.readFileSync(usageFilePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { month: currentMonth(), used: 0 };
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(contents);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("month" in parsed) ||
    typeof parsed.month !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(parsed.month) ||
    !("used" in parsed) ||
    typeof parsed.used !== "number" ||
    !Number.isSafeInteger(parsed.used) ||
    parsed.used < 0
  ) {
    throw new Error(`Invalid RailKit usage state in ${usageFilePath}.`);
  }
  return { month: parsed.month, used: parsed.used };
}

const savedUsage = loadUsage();
let usageMonth = savedUsage.month;
let monthlyRequests = savedUsage.used;

function persistUsage(month: string, used: number): void {
  const temporaryPath = `${usageFilePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify({ month, used })}\n`, "utf8");
    fs.renameSync(temporaryPath, usageFilePath);
  } catch (error) {
    throw new AppError(
      500,
      "RAILKIT_USAGE_PERSISTENCE_FAILED",
      "Could not persist RailKit usage state.",
      { reason: error instanceof Error ? error.message : String(error) },
    );
  }
}

function redactText(value: string): string {
  let redacted = value;
  const apiKey = env.railkit.apiKey;
  if (apiKey) redacted = redacted.split(apiKey).join("[redacted]");
  return redacted
    .replace(
      /((?:authorization|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi,
      "$1[redacted]",
    )
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
}

function redactBody(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactBody);
  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      redacted[key] = SENSITIVE_FIELD.test(key) ? "[redacted]" : redactBody(entry);
    }
    return redacted;
  }
  return value;
}

function railkitErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const record = body as Record<string, unknown>;
  const error = record.error;
  const nestedCode =
    error && typeof error === "object" && !Array.isArray(error)
      ? (error as Record<string, unknown>).code
      : undefined;
  const code = nestedCode ?? record.code;
  if (typeof code !== "string" && typeof code !== "number") return undefined;
  const text = String(code);
  if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(text) || redactText(text) !== text) return undefined;
  return text;
}

function sdkErrorDetails(error: unknown): {
  status?: number;
  statusText?: string;
  body?: unknown;
  code?: string;
} {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const response = record.response && typeof record.response === "object"
    ? (record.response as Record<string, unknown>)
    : {};
  const status = response.status ?? record.status ?? record.statusCode;
  const statusText = response.statusText ?? record.statusText;
  const body = response.data ?? response.body ?? record.body ?? record.data ?? record.error;
  const code = railkitErrorCode(error);
  return {
    ...(typeof status === "number" && Number.isInteger(status) ? { status } : {}),
    ...(typeof statusText === "string" ? { statusText: redactText(statusText) } : {}),
    ...(body !== undefined ? { body: redactBody(body) } : {}),
    ...(code ? { code } : {}),
  };
}

async function loadSdk(): Promise<typeof RailKitSdk> {
  sdkPromise ??= dynamicImport("railkit");
  return sdkPromise;
}

async function configureSdk(sdk: typeof RailKitSdk): Promise<void> {
  if (!sdkConfigured) {
    sdk.configure(env.railkit.apiKey);
    sdkConfigured = true;
  }
}

export function clearRailKitCache(): void {
  cache.clear();
}

function currentMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentUsage(): number {
  const month = currentMonth();
  if (month !== usageMonth) {
    persistUsage(month, 0);
    usageMonth = month;
    monthlyRequests = 0;
  }
  return monthlyRequests;
}

function quotaError(): AppError {
  return new AppError(
    429,
    "RAILKIT_QUOTA_EXHAUSTED",
    `RailKit's monthly request limit of ${env.railkit.monthlyRequestLimit} has been reached.`,
    { limit: env.railkit.monthlyRequestLimit, used: currentUsage(), month: usageMonth },
  );
}

export function railkitUsage(): { month: string; used: number; limit: number } {
  const used = currentUsage();
  return {
    month: usageMonth,
    used,
    limit: env.railkit.monthlyRequestLimit,
  };
}

async function request<T = unknown>(
  path: string,
  sdkCall: (sdk: typeof RailKitSdk) => Promise<unknown>,
  ttlMs = 0,
): Promise<RailKitResult<T>> {
  if (!env.railkit.enabled) {
    throw configError("RailKit is disabled. Set RAILKIT_ENABLED=true to enable live railway data.");
  }
  if (!env.railkit.configured) {
    throw configError(
      "RailKit is not configured. Set RAILKIT_API_KEY in your .env (get a key at https://railkit.in/dashboard).",
    );
  }

  const key = path;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return { value: cached.value as T, cached: true };
  }

  const pending = inFlight.get(key);
  if (pending) return (await pending) as RailKitResult<T>;

  if (currentUsage() >= env.railkit.monthlyRequestLimit) {
    throw quotaError();
  }

  const requestPromise = (async (): Promise<RailKitResult<unknown>> => {
    try {
      const sdk = await loadSdk();
      await configureSdk(sdk);
      const sdkResponse = sdkCall(sdk);
      const nextMonthlyRequests = monthlyRequests + 1;
      monthlyRequests = nextMonthlyRequests;
      try {
        persistUsage(usageMonth, nextMonthlyRequests);
      } catch (error) {
        void sdkResponse.catch((sdkError: unknown) => {
          const details = sdkErrorDetails(sdkError);
          logger.warn(SCOPE, "RailKit SDK request failed while usage persistence failed", {
            status: details.status,
            statusText: details.statusText,
            body: details.body,
            path,
            railkitErrorCode: details.code,
          });
        });
        throw error;
      }
      let timeout: NodeJS.Timeout | undefined;
      const payload = await Promise.race([
        sdkResponse,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new AppError(504, "RAILKIT_TIMEOUT", "RailKit did not respond in time.")),
            env.railkit.timeoutMs,
          );
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });

      if (ttlMs > 0) {
        cache.set(key, { value: payload, expires: Date.now() + ttlMs });
      }
      return { value: payload, cached: false };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const details = sdkErrorDetails(error);
      if (details.status !== undefined) {
        logger.warn(SCOPE, "RailKit SDK request failed", {
          status: details.status,
          statusText: details.statusText,
          body: details.body,
          path,
          railkitErrorCode: details.code,
        });
        if (details.status === 429) {
          throw new AppError(429, "RAILKIT_RATE_LIMITED", "RailKit rate limit reached. Try again shortly.");
        }
        throw new AppError(
          502,
          "RAILKIT_HTTP_ERROR",
          `RailKit responded with HTTP ${details.status} for ${path}.`,
          { status: details.status },
        );
      }
      throw new AppError(502, "RAILKIT_UNREACHABLE", "Could not reach RailKit.");
    }
  })();
  inFlight.set(key, requestPromise);
  try {
    return (await requestPromise) as RailKitResult<T>;
  } finally {
    if (inFlight.get(key) === requestPromise) inFlight.delete(key);
  }
}

/** RailKit wraps payloads in different shapes; unwrap the common ones. */
export function unwrapPayload(payload: unknown): unknown {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if ("data" in record && record.data !== undefined) return record.data;
    if ("result" in record && record.result !== undefined) return record.result;
  }
  return payload;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function normalizeLiveStation(value: unknown): LiveTrainStation | null {
  if (typeof value === "string") {
    return { code: null, name: stringValue(value), lat: null, lng: null };
  }
  const record = asRecord(value);
  if (!record) return null;
  const station = asRecord(firstValue(record, "station", "halt", "location")) ?? record;
  return {
    code: stringValue(firstValue(station, "stationCode", "station_code", "stnCode", "stn_code", "code")),
    name: stringValue(firstValue(station, "stationName", "station_name", "stnName", "stn_name", "name", "locationName")),
    lat: finiteNumber(firstValue(record, "lat", "latitude") ?? firstValue(station, "lat", "latitude")),
    lng: finiteNumber(firstValue(record, "lng", "lon", "longitude") ?? firstValue(station, "lng", "lon", "longitude")),
  };
}

function normalizeLiveTrainInfo(
  payload: unknown,
  trainNumber: string,
  cached: boolean,
): LiveTrainData {
  const data = asRecord(unwrapPayload(payload)) ?? {};
  const trainInfo = asRecord(firstValue(data, "trainInfo", "train_info", "train")) ?? {};
  const rawCurrentLocation = firstValue(data, "currentLocation", "current_location", "currentStation", "current_station");
  const nextHalt = firstValue(data, "nextHalt", "next_halt", "nextStation", "next_station");
  const currentLocation = normalizeLiveStation(rawCurrentLocation);
  const nextStation = normalizeLiveStation(nextHalt);
  const rawDistance =
    firstValue(data, "distanceToNextStation", "distance_to_next_station", "distanceToNextHalt", "distance_to_next_halt") ??
    (asRecord(nextHalt) && firstValue(asRecord(nextHalt)!, "distance", "distanceKm", "distance_km"));
  const speed = finiteNumber(firstValue(data, "speedKmph", "speed_kmph", "speed"));

  return {
    trainNumber,
    trainName:
      stringValue(firstValue(trainInfo, "trainName", "train_name", "name")) ??
      stringValue(firstValue(data, "trainName", "train_name")),
    currentLocation,
    nextStation,
    distanceToNextStationKm: finiteNumber(rawDistance),
    delayMinutes: finiteNumber(firstValue(data, "delayMinutes", "delay_minutes", "delay")),
    speedKmph: speed ?? finiteNumber(firstValue(asRecord(rawCurrentLocation) ?? {}, "speed", "speedKmph", "speed_kmph")),
    etaMinutes: finiteNumber(firstValue(data, "etaMinutes", "eta_minutes", "estimatedArrivalMinutes", "estimated_arrival_minutes")),
    route: firstValue(data, "route", "stations") ?? null,
    coachPosition: firstValue(data, "coachPosition", "coach_position") ?? null,
    source: "RAILKIT",
    cached,
  };
}

/* ----------------------------- endpoints ------------------------------ */

const MINUTE = 60 * 1000;

export const railkit = {
  /** RailKit SDK station lookup by code. */
  async stationByCode(stationCode: string): Promise<RailKitResult<unknown>> {
    const key = `/api/v1/stations/${encodeURIComponent(stationCode)}`;
    const result = await request(key, (sdk) => sdk.stationByCode(stationCode), 24 * 60 * MINUTE);
    return { ...result, value: unwrapPayload(result.value) };
  },

  /** RailKit SDK train lookup by number. */
  async trainByNumber(trainNumber: string): Promise<RailKitResult<unknown>> {
    const key = `/api/v1/trains/${encodeURIComponent(trainNumber)}`;
    const result = await request(key, (sdk) => sdk.trainByNumber(trainNumber), 24 * 60 * MINUTE);
    return { ...result, value: unwrapPayload(result.value) };
  },

  /** RailKit SDK train information, including route and running schedule. */
  async trainInfo(trainNumber: string): Promise<RailKitResult<unknown>> {
    const key = `/api/v1/trains/${encodeURIComponent(trainNumber)}/info`;
    const result = await request(key, (sdk) => sdk.getTrainInfo(trainNumber), 24 * 60 * MINUTE);
    return { ...result, value: unwrapPayload(result.value) };
  },

  /** RailKit SDK V2 live tracking. `date` format is DD-MM-YYYY. */
  async trainLive(
    trainNumber: string,
    dateDdMmYyyy: string,
  ): Promise<RailKitResult<LiveTrainData>> {
    const key = `/api/v2/trains/${encodeURIComponent(trainNumber)}/live/${encodeURIComponent(dateDdMmYyyy)}`;
    const result = await request(key, (sdk) => sdk.trackTrainV2(trainNumber, dateDdMmYyyy), 5 * MINUTE);
    return {
      value: normalizeLiveTrainInfo(result.value, trainNumber, result.cached),
      cached: result.cached,
    };
  },

  /** RailKit SDK timetable for a station, optionally for a DD-MM-YYYY date. */
  async stationTimetable(stationCode: string, dateDdMmYyyy?: string): Promise<RailKitResult<unknown>> {
    const query = dateDdMmYyyy ? `?date=${encodeURIComponent(dateDdMmYyyy)}` : "";
    const key = `/api/v1/stations/${encodeURIComponent(stationCode)}/timetable${query}`;
    const result = await request(
      key,
      (sdk) => sdk.trainTimetableAtStation(stationCode, dateDdMmYyyy),
      60 * MINUTE,
    );
    return { ...result, value: unwrapPayload(result.value) };
  },
};

/** Today in DD-MM-YYYY, the format RailKit documents for dates. */
export function todayDdMmYyyy(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function railkitStatus(): { configured: boolean; enabled: boolean; baseUrl: string } {
  return {
    configured: env.railkit.enabled && env.railkit.configured,
    enabled: env.railkit.enabled,
    baseUrl: env.railkit.baseUrl,
  };
}

logger.info(SCOPE, "RailKit client ready", {
  enabled: env.railkit.enabled,
  configured: env.railkit.configured,
});
