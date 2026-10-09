import { env } from "../config/env";
import { haversineMeters, projectOnRoute } from "../lib/geo";
import type { GeoPoint, RouteStation, StationEta, TrainRoute } from "../types";

/**
 * Next-station / route-progress logic (Phase 8).
 *
 * Pure functions — no I/O, no side effects — so they are easy to reason about
 * and to unit-test with demo routes.
 *
 * Design notes:
 *  - Progress is derived by projecting the GPS fix onto the polyline formed by
 *    the train's stations, not by "distance to the nearest station" alone.
 *  - The *direction* of travel persists between calls so a train running in
 *    the opposite direction still reports the correct next station.
 *  - We never claim track-level accuracy: outputs are explicitly approximate.
 */

export const AT_STATION_RADIUS_M = 1500;
const ARRIVED_TOLERANCE_KM = 0.5;
const DIRECTION_CHANGE_KM = 0.4;
const FALLBACK_SPEED_KMPH = 55;

export interface RouteGeometry {
  points: GeoPoint[];
  stations: RouteStation[];
  cumulativeKm: number[];
}

export function buildGeometry(route: TrainRoute): RouteGeometry {
  const geoStations = route.stations.filter(
    (s): s is RouteStation & { lat: number; lng: number } =>
      typeof s.lat === "number" && typeof s.lng === "number",
  );

  const points: GeoPoint[] = geoStations.map((s) => ({ lat: s.lat, lng: s.lng }));
  const cumulativeKm: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (i > 0) total += haversineMeters(points[i - 1], points[i]) / 1000;
    cumulativeKm.push(total);
  }
  return { points, stations: geoStations, cumulativeKm };
}

export interface ProgressInput {
  route: TrainRoute;
  location: GeoPoint;
  previousDirection?: 1 | -1 | null;
  previousProgressKm?: number | null;
  previousPoint?: GeoPoint | null;
  speedKmph?: number | null;
}

export interface ProgressResult {
  geometry: RouteGeometry;
  currentStation: RouteStation | null;
  nextStation: RouteStation | null;
  direction: 1 | -1;
  progressKm: number | null;
  nearestStation: RouteStation | null;
  nearestDistanceM: number | null;
  corridorDistanceM: number | null;
  atStation: boolean;
}

export function computeProgress(input: ProgressInput): ProgressResult {
  const geometry = buildGeometry(input.route);
  const empty: ProgressResult = {
    geometry,
    currentStation: null,
    nextStation: null,
    direction: input.previousDirection ?? 1,
    progressKm: null,
    nearestStation: null,
    nearestDistanceM: null,
    corridorDistanceM: null,
    atStation: false,
  };

  if (geometry.points.length === 0) return empty;

  const projection = projectOnRoute(input.location, geometry.points, geometry.cumulativeKm);
  const nearestStation = geometry.stations[projection.nearestIndex] ?? null;
  const nearestDistanceM = nearestStation
    ? haversineMeters(input.location, {
        lat: nearestStation.lat as number,
        lng: nearestStation.lng as number,
      })
    : null;

  const progressKm = projection.progressKm;
  const direction = resolveDirection({
    progressKm,
    previousProgressKm: input.previousProgressKm ?? null,
    previousDirection: input.previousDirection ?? null,
    previousPoint: input.previousPoint ?? null,
    location: input.location,
    geometry,
    nearestIndex: projection.nearestIndex,
  });
  const tol = ARRIVED_TOLERANCE_KM;
  let currentIndex: number;

  if (direction === 1) {
    currentIndex = 0;
    for (let i = 0; i < geometry.cumulativeKm.length; i += 1) {
      if (geometry.cumulativeKm[i] <= progressKm + tol) currentIndex = i;
      else break;
    }
    // Arrived: the device is inside the arrival radius of a station ahead of
    // our projected position (GPS lag) — treat it as the current station.
    if (nearestDistanceM !== null && nearestDistanceM <= AT_STATION_RADIUS_M && projection.nearestIndex > currentIndex) {
      currentIndex = projection.nearestIndex;
    }
  } else {
    currentIndex = geometry.cumulativeKm.length - 1;
    for (let i = geometry.cumulativeKm.length - 1; i >= 0; i -= 1) {
      if (geometry.cumulativeKm[i] >= progressKm - tol) currentIndex = i;
      else break;
    }
    if (nearestDistanceM !== null && nearestDistanceM <= AT_STATION_RADIUS_M && projection.nearestIndex < currentIndex) {
      currentIndex = projection.nearestIndex;
    }
  }

  const currentStation = geometry.stations[currentIndex] ?? null;
  const nextIndex = direction === 1 ? currentIndex + 1 : currentIndex - 1;
  const nextStation = geometry.stations[nextIndex] ?? null;

  return {
    geometry,
    currentStation,
    nextStation,
    direction,
    progressKm,
    nearestStation,
    nearestDistanceM,
    corridorDistanceM: Number.isFinite(projection.corridorDistanceM)
      ? projection.corridorDistanceM
      : null,
    atStation: (nearestDistanceM ?? Infinity) <= AT_STATION_RADIUS_M,
  };
}

interface DirectionInput {
  progressKm: number;
  previousProgressKm: number | null;
  previousDirection: 1 | -1 | null;
  previousPoint: GeoPoint | null;
  location: GeoPoint;
  geometry: RouteGeometry;
  nearestIndex: number;
}

/**
 * Direction of travel, strongest signal first:
 *   1. change in projected progress since the previous fix
 *   2. device travel bearing vs. the bearing of the route itself
 *   3. persisted direction, else forward default
 */
function resolveDirection(input: DirectionInput): 1 | -1 {
  const { progressKm, previousProgressKm, previousDirection, previousPoint, geometry, nearestIndex } =
    input;

  if (previousProgressKm !== null) {
    const delta = progressKm - previousProgressKm;
    if (Math.abs(delta) >= DIRECTION_CHANGE_KM) return delta > 0 ? 1 : -1;
  }

  if (previousPoint && haversineMeters(previousPoint, input.location) >= 100) {
    const travelBearing = initialBearing(previousPoint, input.location);
    const a = geometry.points[nearestIndex];
    const forward = geometry.points[Math.min(nearestIndex + 1, geometry.points.length - 1)];
    const backward = geometry.points[Math.max(nearestIndex - 1, 0)];

    if (a && forward && backward) {
      const dForward = angularDifference(travelBearing, initialBearing(a, forward));
      const dBackward = angularDifference(travelBearing, initialBearing(a, backward));
      if (Math.abs(dForward - dBackward) > 25) return dForward < dBackward ? 1 : -1;
    }
  }

  return previousDirection ?? 1;
}

function initialBearing(a: GeoPoint, b: GeoPoint): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function angularDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Update persisted direction from two consecutive progress values.
 * Keeps hysteresis so GPS jitter does not flip the next station every second.
 */
export function reconcileDirection(
  previousDirection: 1 | -1,
  previousProgressKm: number | null,
  nextProgressKm: number | null,
): 1 | -1 {
  if (previousProgressKm === null || nextProgressKm === null) return previousDirection;
  const delta = nextProgressKm - previousProgressKm;
  if (Math.abs(delta) < DIRECTION_CHANGE_KM) return previousDirection;
  return delta > 0 ? 1 : -1;
}

/** Estimated arrival at the next station — always labelled as an estimate. */
export function estimateArrival(
  progress: ProgressResult,
  speedKmph: number | null,
): StationEta | null {
  if (!progress.nextStation) return null;

  const target = progress.nextStation;
  const targetIdx = target.index;
  const geoIdx = progress.geometry.stations.findIndex((s) => s.code === target.code && s.index === targetIdx);
  if (geoIdx < 0 || progress.progressKm === null) {
    return {
      minutes: null,
      scheduledTime: target.scheduledArrival,
      note: "Arrival estimate unavailable for this position.",
    };
  }

  const cumulative = progress.geometry.cumulativeKm;
  const targetCum = cumulative[geoIdx];
  const remainingKm = Math.abs(targetCum - progress.progressKm);
  const speed = speedKmph && speedKmph > 8 ? speedKmph : FALLBACK_SPEED_KMPH;
  const minutes = Math.max(1, Math.round((remainingKm / speed) * 60));

  return {
    minutes,
    scheduledTime: target.scheduledArrival,
    note:
      speedKmph && speedKmph > 8
        ? "Estimated from your current speed. Approximate only."
        : `Estimated assuming ~${FALLBACK_SPEED_KMPH} km/h. Approximate only.`,
  };
}

export function defaultThreshold(): number {
  return env.rules.verifyThreshold;
}
