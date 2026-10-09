import type { GeoPoint } from "../types";

const EARTH_RADIUS_M = 6371000;
const DEG = Math.PI / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Shortest distance in metres from point `p` to the great-circle-ish line
 * segment a→b. We project onto a local equirectangular plane, which is
 * accurate enough at railway scales (< a few hundred km).
 */
export function pointToSegmentMeters(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const latRef = p.lat * DEG;
  const mPerDegLat = EARTH_RADIUS_M;
  const mPerDegLng = EARTH_RADIUS_M * Math.cos(latRef);

  const px = p.lng * mPerDegLng;
  const py = p.lat * mPerDegLat;
  const ax = a.lng * mPerDegLng;
  const ay = a.lat * mPerDegLat;
  const bx = b.lng * mPerDegLng;
  const by = b.lat * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Shortest distance from a point to a polyline, in metres. */
export function pointToPolylineMeters(p: GeoPoint, line: GeoPoint[]): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  if (line.length === 1) return haversineMeters(p, line[0]);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i += 1) {
    const d = pointToSegmentMeters(p, line[i], line[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

export interface RouteProjection {
  /** Index of the closest vertex on the polyline. */
  nearestIndex: number;
  /** Perpendicular distance to the polyline, metres. */
  corridorDistanceM: number;
  /**
   * Signed progress along the polyline in km (0 = start of route).
   * Based on perpendicular projection onto the closest segment.
   */
  progressKm: number;
  /** -1 / +1 — which way along the polyline the point is facing. */
  facing: 1 | -1;
}

/** Project a point onto an ordered set of stations that have coordinates. */
export function projectOnRoute(
  p: GeoPoint,
  points: GeoPoint[],
  cumulativeKm: number[],
): RouteProjection {
  if (points.length === 0) {
    return { nearestIndex: 0, corridorDistanceM: Number.POSITIVE_INFINITY, progressKm: 0, facing: 1 };
  }
  if (points.length === 1) {
    return {
      nearestIndex: 0,
      corridorDistanceM: haversineMeters(p, points[0]),
      progressKm: 0,
      facing: 1,
    };
  }

  const latRef = p.lat * DEG;
  const mPerDegLat = EARTH_RADIUS_M;
  const mPerDegLng = EARTH_RADIUS_M * Math.cos(latRef);

  const px = p.lng * mPerDegLng;
  const py = p.lat * mPerDegLat;

  let best = {
    nearestIndex: 0,
    corridorDistanceM: Number.POSITIVE_INFINITY,
    progressKm: 0,
    segmentIndex: 0,
    t: 0,
  };

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const ax = a.lng * mPerDegLng;
    const ay = a.lat * mPerDegLat;
    const bx = b.lng * mPerDegLng;
    const by = b.lat * mPerDegLat;

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const dist = Math.hypot(px - cx, py - cy);

    if (dist < best.corridorDistanceM) {
      best = { nearestIndex: i, corridorDistanceM: dist, progressKm: 0, segmentIndex: i, t };
    }
  }

  const segA = cumulativeKm[best.segmentIndex] ?? 0;
  const segB = cumulativeKm[best.segmentIndex + 1] ?? segA;
  const progressKm = segA + (segB - segA) * best.t;

  // Nearest vertex is either end of the winning segment.
  const vertexIndex = best.t > 0.5 ? best.segmentIndex + 1 : best.segmentIndex;

  return {
    nearestIndex: vertexIndex,
    corridorDistanceM: best.corridorDistanceM,
    progressKm,
    facing: 1,
  };
}

export function kmToMeters(km: number): number {
  return km * 1000;
}

export function metersToKm(m: number): number {
  return m / 1000;
}

/** Speed in km/h from two samples. Returns null when timing is unusable. */
export function speedKmhBetween(
  a: { lat: number; lng: number; timestamp: number },
  b: { lat: number; lng: number; timestamp: number },
): number | null {
  const dtMs = b.timestamp - a.timestamp;
  if (dtMs < 500) return null;
  const meters = haversineMeters(a, b);
  return (meters / (dtMs / 1000)) * 3.6;
}

/** Compass bearing difference helper (0..180). */
export function bearingDelta(a: number | null, b: number): number | null {
  if (a === null || Number.isNaN(a)) return null;
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
}
