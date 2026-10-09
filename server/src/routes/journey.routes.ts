import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { DEMO_ROUTES } from "../data/demoRoutes";
import { getRepo } from "../db";
import { badRequest, notFound } from "../lib/errors";
import { sendOk } from "../lib/response";
import { parseOrThrow } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { verifyJourney } from "../services/journeyVerificationService";
import { verifyLimiter } from "../middleware/rateLimit";
import type { Journey, RouteStation, VerificationResult } from "../types";
import { verifyJourneySchema } from "../validation/schemas";
import { getTrainLive } from "../services/trainRouteService";

export const journeyRouter = Router();

function tokenOf(req: { auth?: { token?: string } }): string | undefined {
  return req.auth?.token;
}

function stationFromLive(
  live: { code: string | null; name: string | null } | null,
  stations: RouteStation[],
  fallback: RouteStation | null,
): RouteStation | null {
  if (!live?.code && !live?.name) return fallback;
  const match = stations.find(
    (station) =>
      (live.code && station.code.toUpperCase() === live.code.toUpperCase()) ||
      (live.name && station.name.toLowerCase() === live.name.toLowerCase()),
  );
  return match ?? fallback;
}

/**
 * POST /api/journey/verify
 *
 * The single entry point for journey verification. Runs on the SERVER:
 * the browser only supplies a train number, coach and raw GPS fix.
 *
 * Idempotent: re-calling it for the same train/coach updates the existing
 * active journey (which is how the "next station" advances as the train runs).
 */
journeyRouter.post("/journey/verify", verifyLimiter, requireAuth, async (req, res, next) => {
  try {
    const body = parseOrThrow(verifyJourneySchema, req.body);
    const repo = getRepo(tokenOf(req));
    const userId = req.auth!.userId;
    const demoScenarioRequested =
      body.presentationDemo === true &&
      env.rules.enableDemoData &&
      body.trainNumber === "12951" &&
      body.coach === "S1" &&
      body.demoStage !== undefined;
    const demoStation = demoScenarioRequested
      ? DEMO_ROUTES["12951"].stations[body.demoStage! + 1]
      : null;
    const location = demoScenarioRequested && demoStation
      ? {
          lat: demoStation.lat!,
          lng: demoStation.lng!,
          accuracy: 10,
          speed: 55 / 3.6,
          heading: null,
          timestamp: Date.now(),
        }
      : body.location;
    if (!location) {
      throw badRequest("A browser location is required unless Presentation Demo is enabled for train 12951 / coach S1.");
    }

    // One active journey at a time; prefer an existing journey for this train+coach.
    const active = await repo.getActiveJourney(userId);
    let existing: Journey | null = null;
    if (active) {
      const sameTrainAndCoach =
        active.train_number === body.trainNumber && active.coach.toUpperCase() === body.coach.toUpperCase();
      const matchesHint = body.journeyId && active.id === body.journeyId;
      if (sameTrainAndCoach || matchesHint) {
        existing = active;
      } else {
        await repo.endJourney(active.id, userId);
      }
    }

    const previous = existing
      ? {
          progressKm: existing.progress_km,
          direction: existing.direction,
          lat: existing.last_lat,
          lng: existing.last_lng,
          seenAtMs: existing.last_seen_at ? Date.parse(existing.last_seen_at) : null,
        }
      : null;

    const { result, route } = await verifyJourney({
      trainNumber: body.trainNumber,
      coach: body.coach.toUpperCase(),
      location,
      presentationDemo: demoScenarioRequested,
      previous,
    });

    const liveResult = demoScenarioRequested
      ? { payload: null, warnings: [] as string[] }
      : await getTrainLive(body.trainNumber, undefined, result.currentStation?.code ?? undefined);
    const liveTrain = liveResult.payload;
    const railkitCurrentStation = stationFromLive(
      liveTrain?.currentLocation ?? null,
      route.stations,
      result.currentStation,
    );
    const railkitNextStation = stationFromLive(
      liveTrain?.nextStation ?? null,
      route.stations,
      result.nextStation,
    );
    const liveEtaMinutes =
      liveTrain?.etaMinutes ??
      (liveTrain?.distanceToNextStationKm !== null &&
      liveTrain?.distanceToNextStationKm !== undefined &&
      liveTrain.speedKmph !== null &&
      liveTrain.speedKmph > 0
        ? Math.max(1, Math.round((liveTrain.distanceToNextStationKm / liveTrain.speedKmph) * 60))
        : null);
    const railkitVerification: VerificationResult = liveTrain
      ? {
          ...result,
          currentStation: railkitCurrentStation,
          nextStation: railkitNextStation,
          distanceToNextStationKm:
            liveTrain.distanceToNextStationKm ?? result.distanceToNextStationKm,
          speedKmph: liveTrain.speedKmph ?? result.speedKmph,
          eta:
            liveEtaMinutes !== null
              ? {
                  minutes: liveEtaMinutes,
                  scheduledTime: railkitNextStation?.scheduledArrival ?? result.eta?.scheduledTime ?? null,
                  note: "Estimated from RailKit live running data. Approximate only.",
                }
              : result.eta,
        }
      : result;

    const demoVerified =
      demoScenarioRequested && demoStation !== null;
    const verificationResult: VerificationResult = demoVerified
      ? {
          ...railkitVerification,
          verified: true,
          reason:
            `DEMO_VERIFIED: DEMO_SIMULATION:stage=${body.demoStage}; ${demoStation?.name}. Presentation coordinates are simulated and do not prove real travel.`,
          warnings: [
            ...result.warnings,
            "DEMO LOCATION — simulated train coordinates are used for this presentation journey; real GPS verification is not represented.",
          ],
        }
      : railkitVerification;

    const patch = {
      train_number: body.trainNumber,
      coach: body.coach.toUpperCase(),
      train_name: liveTrain?.trainName ?? route.trainName,
      verified: verificationResult.verified,
      confidence: verificationResult.confidence,
      current_station_code:
        verificationResult.verified
          ? (liveTrain?.currentLocation?.code ?? verificationResult.currentStation?.code ?? null)
          : null,
      current_station_name:
        verificationResult.verified
          ? (liveTrain?.currentLocation?.name ?? verificationResult.currentStation?.name ?? null)
          : null,
      next_station_code:
        verificationResult.verified
          ? (liveTrain?.nextStation?.code ?? verificationResult.nextStation?.code ?? null)
          : null,
      next_station_name:
        verificationResult.verified
          ? (liveTrain?.nextStation?.name ?? verificationResult.nextStation?.name ?? null)
          : null,
      progress_km: verificationResult.progressKm,
      direction: verificationResult.direction,
      last_lat: location.lat,
      last_lng: location.lng,
      last_speed_kmph: verificationResult.speedKmph,
      last_seen_at: new Date(location.timestamp).toISOString(),
      route_source: verificationResult.routeSource,
      verify_reason: verificationResult.reason,
      status: "ACTIVE" as const,
    };

    let journey: Journey;
    if (existing) {
      journey = await repo.updateJourney(existing.id, {
        ...patch,
        sample_count: (existing.sample_count ?? 1) + 1,
      });
    } else {
      journey = await repo.createJourney({
        user_id: userId,
        ...patch,
        status: "ACTIVE",
      });
    }

    const verification: VerificationResult = { ...verificationResult };
    const warnings = [...verificationResult.warnings, ...liveResult.warnings];
    if (!verificationResult.verified) {
      // Never show station predictions for an unverified journey.
      verification.currentStation = null;
      verification.nextStation = null;
      verification.eta = null;
      warnings.push(
        "Station detection is withheld until the journey is verified. Check your train number, coach and location permission.",
      );
    }

    sendOk(res, { journey, verification, liveTrain }, { warnings });
  } catch (error) {
    next(error);
  }
});

/** GET /api/journey/active — the caller's current journey, if any. */
journeyRouter.get("/journey/active", requireAuth, async (req, res, next) => {
  try {
    const repo = getRepo(tokenOf(req));
    const journey = await repo.getActiveJourney(req.auth!.userId);
    sendOk(res, { journey });
  } catch (error) {
    next(error);
  }
});

/** GET /api/journey/:id */
journeyRouter.get("/journey/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = parseOrThrow(z.object({ id: z.string().min(8).max(64) }), req.params);
    const repo = getRepo(tokenOf(req));
    const journey = await repo.getJourney(id, req.auth!.userId);
    if (!journey) throw notFound("Journey not found.");
    sendOk(res, journey);
  } catch (error) {
    next(error);
  }
});

/** POST /api/journey/:id/end — stops tracking for this journey. */
journeyRouter.post("/journey/:id/end", requireAuth, async (req, res, next) => {
  try {
    const { id } = parseOrThrow(z.object({ id: z.string().min(8).max(64) }), req.params);
    const repo = getRepo(tokenOf(req));
    const journey = await repo.endJourney(id, req.auth!.userId);
    if (!journey) throw notFound("Journey not found.");
    sendOk(res, journey);
  } catch (error) {
    next(error);
  }
});
