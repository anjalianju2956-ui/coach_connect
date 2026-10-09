/**
 * Offline regression check for the journey-verification engine.
 *
 *   npm run verify            (from the repo root)
 *   npm run verify --prefix server
 *
 * Runs entirely in-process: no server, no network, no API keys. It exercises
 * the pure maths (scoring, route progress, ETA) plus the demo route, so a
 * change that breaks verification fails here before it reaches the browser.
 */

import { DEMO_ROUTES } from "../data/demoRoutes";
import {
  corridorScore,
  movementScore,
  scheduleScore,
  verifyJourney,
} from "../services/journeyVerificationService";
import {
  AT_STATION_RADIUS_M,
  buildGeometry,
  computeProgress,
  estimateArrival,
} from "../services/journeyProgressService";
import { assertTrainNumber } from "../services/trainRouteService";
import { formatMinutesAsHhMm, minutesOfDayLocal } from "../lib/time";
import { env } from "../config/env";
import type { RouteStation } from "../types";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function throws(name: string, fn: () => unknown): void {
  try {
    fn();
    failures.push(name);
    console.error(`  FAIL  ${name} — expected an error, none was thrown`);
  } catch {
    passed += 1;
    console.log(`  PASS  ${name}`);
  }
}

const BVI = DEMO_ROUTES["12951"].stations.find((s) => s.code === "BVI")!;
const VAPI = DEMO_ROUTES["12951"].stations.find((s) => s.code === "VAPI")!;

/** Demo coordinates are typed nullable; the check needs real numbers. */
function requireCoord(value: number | null, what: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`demo route is missing ${what}`);
  }
  return value;
}
const bviPoint = {
  lat: requireCoord(BVI.lat, "BVI.lat"),
  lng: requireCoord(BVI.lng, "BVI.lng"),
};

async function main(): Promise<void> {
  console.log("\nCoach-Connect verification engine check\n");

  /* ------------------------------ route input ------------------------------ */
  console.log("Train number validation");
  check("accepts 12951", assertTrainNumber("12951") === "12951");
  throws("rejects a 4-digit train number", () => assertTrainNumber("1295"));
  throws("rejects letters", () => assertTrainNumber("1295A"));

  /* -------------------------------- scoring -------------------------------- */
  console.log("\nSignal scoring");
  check("corridor score is 1 on the route line", corridorScore(0, 12) === 1);
  check(
    "corridor score drops with distance",
    corridorScore(1000, 12) > corridorScore(5000, 12) && corridorScore(5000, 12) > 0,
  );
  check("corridor score is 0 beyond the corridor", corridorScore(20_000, 12) === 0);
  check("missing corridor distance scores 0", corridorScore(null, 12) === 0);

  check("100 km/h reads as train movement", movementScore(100).score === 1);
  check("speed unknown is treated cautiously", movementScore(null).score === 0.45);
  check("250 km/h is implausible", movementScore(250).score === 0.3);

  const nowMinutes = minutesOfDayLocal(Date.now());
  const onTimeStation: RouteStation = { ...BVI, scheduledArrival: formatMinutesAsHhMm(nowMinutes) };
  const onTime = scheduleScore(onTimeStation, Date.now());
  check("station scheduled right now scores 1", onTime.score === 1, onTime.detail);
  const delayedStation: RouteStation = {
    ...BVI,
    scheduledArrival: formatMinutesAsHhMm((nowMinutes + 600) % 1440),
  };
  const delayed = scheduleScore(delayedStation, Date.now());
  check("station 10 h away from the clock scores low", delayed.score <= 0.6, delayed.detail);

  /* ---------------------------- route progress ----------------------------- */
  console.log("\nRoute progress (demo route 12951)");
  const geometry = buildGeometry(DEMO_ROUTES["12951"]);
  check("geometry keeps all 12 demo stops", geometry.points.length === 12, `${geometry.points.length}`);

  const atBvi = computeProgress({ route: DEMO_ROUTES["12951"], location: bviPoint });
  check("current station is BVI", atBvi.currentStation?.code === "BVI", atBvi.currentStation?.code ?? "null");
  check("next station is VAPI", atBvi.nextStation?.code === "VAPI", atBvi.nextStation?.code ?? "null");
  check("direction is forward", atBvi.direction === 1);
  check("corridor distance is ~0 on the line", (atBvi.corridorDistanceM ?? 99_999) < 100);
  check(
    "station is inside the at-station radius",
    (atBvi.nearestDistanceM ?? 99_999) <= AT_STATION_RADIUS_M,
  );

  const offRoute = computeProgress({ route: DEMO_ROUTES["12951"], location: { lat: 23.5, lng: 68.5 } });
  check("far-away fix reports a large corridor distance", (offRoute.corridorDistanceM ?? 0) > 12_000);

  const eta = estimateArrival(atBvi, 100);
  check("ETA has minutes for a known next station", typeof eta?.minutes === "number" && (eta.minutes ?? 0) >= 1);

  /* --------------------------- end-to-end verify --------------------------- */
  console.log("\nverifyJourney (offline, demo route)");
  const good = await verifyJourney({
    trainNumber: "12951",
    coach: "S1",
    location: {
      lat: bviPoint.lat,
      lng: bviPoint.lng,
      accuracy: 25,
      speed: 27.7, // ~100 km/h in m/s
      heading: 45,
      timestamp: Date.now(),
    },
  });
  check("near the route at 100 km/h → verified", good.result.verified === true, good.result.reason);
  check(
    "confidence is above the configured threshold",
    good.result.confidence >= good.result.threshold,
    `${good.result.confidence} < ${good.result.threshold}`,
  );
  check("route source is the demo route", good.result.routeSource === "demo");
  check("next station is reported", good.result.nextStation?.code === "VAPI");
  check("five signals are reported", good.result.signals.length === 5, `${good.result.signals.length}`);
  // The weights are normalised (their sum need not be 1) — what must hold is
  // that confidence is exactly the weighted mean of the signal scores.
  const weightSum = good.result.signals.reduce((sum, s) => sum + s.weight, 0);
  const weightedMean =
    good.result.signals.reduce((sum, s) => sum + s.score * s.weight, 0) / weightSum;
  check("every signal carries a positive weight", good.result.signals.every((s) => s.weight > 0));
  check(
    "confidence is the normalised weighted mean of the signals",
    weightSum > 0 && Math.abs(weightedMean - good.result.confidence) < 0.001,
    `${weightedMean} vs ${good.result.confidence}`,
  );
  check("coach is echoed back", good.result.coach === "S1");

  const parked = await verifyJourney({
    trainNumber: "12951",
    coach: "S1",
    location: {
      lat: bviPoint.lat,
      lng: bviPoint.lng,
      accuracy: 30,
      speed: 0,
      heading: null,
      timestamp: Date.now(),
    },
  });
  check("stationary on the route still verifies", parked.result.verified === true, parked.result.reason);

  const far = await verifyJourney({
    trainNumber: "12951",
    coach: "S1",
    location: {
      lat: 23.5,
      lng: 68.5,
      accuracy: 30,
      speed: 27.7,
      heading: null,
      timestamp: Date.now(),
    },
  });
  check("500 km off the corridor → NOT verified", far.result.verified === false);
  check("off-corridor failure names the distance", /km from the 12951 route/.test(far.result.reason), far.result.reason);

  const stationaryAnywhere = await verifyJourney({
    trainNumber: "12951",
    coach: "S1",
    location: { lat: 19.2813, lng: 72.8596, accuracy: 1_000, speed: null, heading: null, timestamp: Date.now() },
  });
  check(
    "poor accuracy cannot silently push confidence over the line",
    stationaryAnywhere.result.confidence <= good.result.confidence,
    `${stationaryAnywhere.result.confidence} > ${good.result.confidence}`,
  );

  /* --------------------------------- report -------------------------------- */
  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      ` (threshold ${env.rules.verifyThreshold}, corridor ${env.rules.maxOffCorridorKm} km)\n`,
  );
  if (failures.length > 0) {
    console.error("Failures:");
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error("");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nVerification engine check crashed:");
  console.error(error);
  process.exitCode = 1;
});
