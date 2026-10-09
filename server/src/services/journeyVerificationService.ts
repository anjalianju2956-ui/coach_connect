import { env } from "../config/env";
import { haversineMeters } from "../lib/geo";
import { minutesOfDayLocal, parseHhMm } from "../lib/time";
import type {
  LocationSample,
  RouteStation,
  TrainRoute,
  VerificationResult,
  VerificationSignal,
} from "../types";
import { DEMO_ROUTES } from "../data/demoRoutes";
import { getTrainRoute } from "./trainRouteService";
import { ensureRouteCoordinates } from "./stationService";
import { estimateArrival, computeProgress, reconcileDirection, type ProgressResult } from "./journeyProgressService";

/**
 * Journey verification engine (Phase 7).
 *
 * GPS alone is NOT proof that somebody is on a train — so several independent
 * signals are combined into a transparent confidence score, and the caller
 * must not treat "location detected" as "journey verified".
 *
 * Signals and weights (documented on purpose — the maths is meant to be
 * auditable, not magic):
 *
 *   corridor proximity   0.40  is the device on/near this train's route?
 *   movement/speed       0.22  is the speed plausible for a train?
 *   schedule consistency 0.13  does the clock match the timetable position?
 *   route resolved       0.10  do we actually have railway data for this train?
 *   station proximity    0.10  is the device near a station on this route?
 *
 * The final score is reduced when GPS accuracy is poor.
 * verified = confidence >= threshold AND within MAX_OFF_CORRIDOR_KM of the route.
 */

const SCOPE = "verify";

const WEIGHTS = {
  corridor: 0.4,
  movement: 0.22,
  schedule: 0.13,
  route: 0.1,
  station: 0.1,
} as const;

/** Schedule times come from Indian Railways (IST, UTC+05:30) by default. */

export interface VerifyInput {
  trainNumber: string;
  coach: string;
  location: LocationSample;
  presentationDemo?: boolean;
  previous?: {
    progressKm: number | null;
    direction: 1 | -1;
    lat: number | null;
    lng: number | null;
    seenAtMs: number | null;
  } | null;
}

export interface VerifyOutcome {
  result: VerificationResult;
  route: TrainRoute;
  progress: ProgressResult;
}

/* -------------------------------- scoring -------------------------------- */

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

export function corridorScore(distanceM: number | null, maxOffCorridorKm: number): number {
  if (distanceM === null || !Number.isFinite(distanceM)) return 0;
  if (distanceM > maxOffCorridorKm * 1000) return 0;
  return interpolate(distanceM, [0, 800, 3000, 8000, maxOffCorridorKm * 1000], [1, 0.9, 0.7, 0.35, 0.05]);
}

export function movementScore(speedKmph: number | null): { score: number; detail: string } {
  if (speedKmph === null) {
    return { score: 0.45, detail: "Speed unavailable from the browser — treated as unknown." };
  }
  if (speedKmph < 2) return { score: 0.3, detail: "Device is stationary (could be halted at a station)." };
  if (speedKmph < 20) return { score: 0.55, detail: `${speedKmph.toFixed(0)} km/h — slow movement / creeping into a station.` };
  if (speedKmph <= 160) return { score: 1, detail: `${speedKmph.toFixed(0)} km/h — consistent with train movement.` };
  if (speedKmph <= 200) return { score: 0.7, detail: `${speedKmph.toFixed(0)} km/h — high but possible for express trains.` };
  return { score: 0.3, detail: `${speedKmph.toFixed(0)} km/h — implausible for a train.` };
}

export function scheduleScore(
  nextStation: RouteStation | null,
  nowMs: number,
): { score: number; detail: string } {
  const scheduled = parseHhMm(nextStation?.scheduledArrival ?? null);
  if (scheduled === null) {
    return { score: 0.6, detail: "Timetable unavailable — time consistency not scored." };
  }
  const now = minutesOfDayLocal(nowMs);
  let diff = Math.abs(now - scheduled);
  diff = Math.min(diff, 1440 - diff); // handle midnight wrap-around

  if (diff <= 180) return { score: 1, detail: `Within ${Math.round(diff)} min of the scheduled time at ${nextStation?.code}.` };
  if (diff <= 360) return { score: 0.6, detail: `${Math.round(diff)} min from schedule — possible delay.` };
  return { score: 0.15, detail: `${Math.round(diff)} min from schedule — position and timetable disagree.` };
}

function accuracyFactor(accuracyM: number): { factor: number; note: string | null } {
  if (accuracyM > 400) return { factor: 0.75, note: `GPS accuracy is poor (${Math.round(accuracyM)} m).` };
  if (accuracyM > 150) return { factor: 0.9, note: `GPS accuracy is moderate (${Math.round(accuracyM)} m).` };
  return { factor: 1, note: null };
}

/* ------------------------------- verification ---------------------------- */

export async function verifyJourney(input: VerifyInput): Promise<VerifyOutcome> {
  const warnings: string[] = [];

  const demoRoute =
    input.presentationDemo &&
    env.rules.enableDemoData &&
    input.trainNumber === "12951" &&
    input.coach === "S1"
      ? DEMO_ROUTES["12951"]
      : null;
  const { route: rawRoute, warnings: routeWarnings } = demoRoute
    ? { route: demoRoute, warnings: [] }
    : await getTrainRoute(input.trainNumber);
  warnings.push(...routeWarnings);

  const { route, warnings: coordWarnings } = await ensureRouteCoordinates(rawRoute);
  warnings.push(...coordWarnings);

  const previous = input.previous ?? null;
  const previousPoint =
    previous && typeof previous.lat === "number" && typeof previous.lng === "number"
      ? { lat: previous.lat, lng: previous.lng }
      : null;

  const rawSpeed = input.location.speed !== null ? input.location.speed * 3.6 : null;
  const derivedSpeed =
    previousPoint && previous?.seenAtMs
      ? (haversineMeters(previousPoint, input.location) /
          Math.max(1, (input.location.timestamp - previous.seenAtMs) / 1000)) *
        3.6
      : null;
  const speedKmph = rawSpeed ?? (derivedSpeed !== null && Number.isFinite(derivedSpeed) ? derivedSpeed : null);

  const progress = computeProgress({
    route,
    location: input.location,
    previousDirection: previous?.direction ?? null,
    previousProgressKm: previous?.progressKm ?? null,
    previousPoint,
    speedKmph,
  });

  const projectedDirection = reconcileDirection(
    previous?.direction ?? 1,
    previous?.progressKm ?? null,
    progress.progressKm,
  );
  if (projectedDirection !== progress.direction) {
    progress.direction = projectedDirection;
    // Re-derive stations with the reconciled direction.
    const corrected = computeProgress({
      route,
      location: input.location,
      previousDirection: projectedDirection,
      previousProgressKm: previous?.progressKm ?? null,
      previousPoint,
      speedKmph,
    });
    corrected.direction = projectedDirection;
    Object.assign(progress, corrected, { direction: projectedDirection });
  }

  const nowMs = input.location.timestamp || Date.now();

  const corridor = corridorScore(progress.corridorDistanceM, env.rules.maxOffCorridorKm);
  const movement = movementScore(speedKmph);
  const schedule = scheduleScore(progress.nextStation, nowMs);
  const stationProximity =
    progress.nearestDistanceM === null
      ? 0
      : interpolate(progress.nearestDistanceM, [0, 1000, 5000, 15000], [1, 0.7, 0.3, 0]);
  const routeResolved =
    route.stations.filter((s) => s.lat !== null && s.lng !== null).length >= 2
      ? route.source === "demo"
        ? 0.8
        : 1
      : 0.3;

  const signals: VerificationSignal[] = [
    {
      key: "corridor",
      label: "Railway corridor proximity",
      score: corridor,
      weight: WEIGHTS.corridor,
      detail:
        progress.corridorDistanceM === null
          ? "Route coordinates unavailable, so corridor distance could not be measured."
          : `Device is ${formatDistance(progress.corridorDistanceM)} from the ${route.trainNumber} route line.`,
    },
    {
      key: "movement",
      label: "Movement / speed",
      score: movement.score,
      weight: WEIGHTS.movement,
      detail: movement.detail,
    },
    {
      key: "schedule",
      label: "Timetable consistency",
      score: schedule.score,
      weight: WEIGHTS.schedule,
      detail: schedule.detail,
    },
    {
      key: "route",
      label: "Railway route data",
      score: routeResolved,
      weight: WEIGHTS.route,
      detail:
        route.source === "demo"
          ? `Route source: DEMO data (${route.stations.length} stops) — not live railway data.`
          : `Route source: RailKit (${route.stations.length} stops).`,
    },
    {
      key: "station",
      label: "Nearest station on route",
      score: stationProximity,
      weight: WEIGHTS.station,
      detail:
        progress.nearestStation && progress.nearestDistanceM !== null
          ? `${progress.nearestStation.name} (${progress.nearestStation.code}) is ${formatDistance(progress.nearestDistanceM)} away.`
          : "No station with coordinates on this route.",
    },
  ];

  const accuracy = accuracyFactor(input.location.accuracy);
  if (accuracy.note) warnings.push(accuracy.note);

  const weightSum = signals.reduce((sum, s) => sum + s.weight, 0);
  const rawConfidence = signals.reduce((sum, s) => sum + s.score * s.weight, 0) / weightSum;
  const confidence = Math.max(0, Math.min(1, rawConfidence * accuracy.factor));

  const threshold = env.rules.verifyThreshold;
  const withinCorridor =
    progress.corridorDistanceM !== null &&
    progress.corridorDistanceM <= env.rules.maxOffCorridorKm * 1000;

  const verified = confidence >= threshold && withinCorridor;

  const reason = verified
    ? `Passenger location and the ${route.trainNumber} route are consistent (confidence ${(confidence * 100).toFixed(0)}%).`
    : buildFailureReason({ confidence, threshold, withinCorridor, corridorDistanceM: progress.corridorDistanceM, route });

  const result: VerificationResult = {
    verified,
    confidence: Number(confidence.toFixed(3)),
    threshold,
    trainNumber: route.trainNumber,
    coach: input.coach,
    locationDetected: true,
    currentStation: progress.currentStation,
    nextStation: progress.nextStation,
    direction: progress.direction,
    progressKm: progress.progressKm !== null ? Number(progress.progressKm.toFixed(1)) : null,
    nearestStationCode: progress.nearestStation?.code ?? null,
    nearestStationDistanceM:
      progress.nearestDistanceM !== null ? Math.round(progress.nearestDistanceM) : null,
    corridorDistanceM:
      progress.corridorDistanceM !== null && Number.isFinite(progress.corridorDistanceM)
        ? Math.round(progress.corridorDistanceM)
        : null,
    distanceToNextStationKm: (() => {
      if (!progress.nextStation || progress.progressKm === null) return null;
      const nextIndex = progress.geometry.stations.findIndex(
        (station) =>
          station.index === progress.nextStation?.index && station.code === progress.nextStation?.code,
      );
      if (nextIndex < 0) return null;
      return Number(Math.abs(progress.geometry.cumulativeKm[nextIndex] - progress.progressKm).toFixed(1));
    })(),
    speedKmph: speedKmph !== null && Number.isFinite(speedKmph) ? Number(speedKmph.toFixed(1)) : null,
    eta: estimateArrival(progress, speedKmph),
    signals,
    reason,
    warnings,
    routeSource: route.source,
    evaluatedAt: new Date().toISOString(),
  };

  loggerDebug(result);
  return { result, route, progress };
}

function buildFailureReason(input: {
  confidence: number;
  threshold: number;
  withinCorridor: boolean;
  corridorDistanceM: number | null;
  route: TrainRoute;
}): string {
  const pct = (input.confidence * 100).toFixed(0);
  if (!input.withinCorridor && input.corridorDistanceM !== null) {
    return `Device is ${formatDistance(input.corridorDistanceM)} from the ${input.route.trainNumber} route — too far to confirm travel on this train (confidence ${pct}%, needs ${input.threshold * 100}%).`;
  }
  if (!input.withinCorridor) {
    return `The ${input.route.trainNumber} route could not be located from the provided coordinates (confidence ${pct}%).`;
  }
  return `Signals were not strong enough to confirm this journey (confidence ${pct}%, needs ${input.threshold * 100}%).`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function loggerDebug(result: VerificationResult): void {
  if (env.isProd) return;
  // eslint-disable-next-line no-console
  console.debug(
    `[${SCOPE}] train=${result.trainNumber} verified=${result.verified} confidence=${result.confidence} corridor=${result.corridorDistanceM}m next=${result.nextStation?.code ?? "-"}`,
  );
}
