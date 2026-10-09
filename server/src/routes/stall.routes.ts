import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { getRepo } from "../db";
import { conflict, forbidden, notFound } from "../lib/errors";
import { sendOk } from "../lib/response";
import { parseOrThrow } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { getMenuForStall, getStallDetail, listStallsForStation } from "../services/stallService";
import type { Journey } from "../types";
import { nextStationQuerySchema } from "../validation/schemas";

export const stallRouter = Router();

function tokenOf(req: Request): string | undefined {
  return req.auth?.token;
}

/** Load a journey owned by the caller and make sure it may browse stalls. */
async function loadVerifiedJourney(req: Request, journeyId: string): Promise<Journey> {
  const repo = getRepo(tokenOf(req));
  const journey = await repo.getJourney(journeyId, req.auth!.userId);
  if (!journey) throw notFound("Journey not found.");
  if (journey.status !== "ACTIVE") {
    throw conflict("This journey has ended. Start a new journey to browse stalls.");
  }
  if (!journey.verified) {
    throw forbidden(
      "Your train journey could not be verified. Please check your train number, coach and location permission.",
    );
  }
  return journey;
}

/**
 * GET /api/stalls/next-station?journeyId=…
 *
 * Returns ONLY the stalls of the journey's next station (or the current
 * station when the train is standing there). Requires a verified journey —
 * this is the product rule that keeps the app from becoming a "nearby
 * stalls" locator.
 */
stallRouter.get("/stalls/next-station", requireAuth, async (req, res, next) => {
  try {
    const query = parseOrThrow(nextStationQuerySchema, req.query);
    const journey = await loadVerifiedJourney(req, query.journeyId);

    const presentationDemo = journey.verify_reason?.startsWith("DEMO_VERIFIED: DEMO_SIMULATION:");
    const targetCode = presentationDemo
      ? journey.current_station_code ?? journey.next_station_code
      : journey.next_station_code ?? journey.current_station_code;
    const targetName = presentationDemo
      ? journey.current_station_name ?? journey.next_station_name
      : journey.next_station_name ?? journey.current_station_name;
    if (!targetCode) {
      throw conflict("Your train has reached the end of its route — no upcoming station.");
    }

    const { matches, warnings } = await listStallsForStation(targetCode, {
      lat: journey.last_lat,
      lng: journey.last_lng,
      coach: journey.coach,
      trainPlatform: null,
    });

    sendOk(
      res,
      {
        station: { code: targetCode, name: targetName ?? targetCode },
        context: {
          trainNumber: journey.train_number,
          coach: journey.coach,
          currentStation: journey.current_station_name,
          currentStationCode: journey.current_station_code,
          nextStation: journey.next_station_name,
          nextStationCode: journey.next_station_code,
          isApproaching: Boolean(journey.next_station_code),
        },
        matches,
      },
      { warnings },
    );
  } catch (error) {
    next(error);
  }
});

/** GET /api/stalls/:stallId — detail (optionally ranked against a journey). */
stallRouter.get("/stalls/:stallId", requireAuth, async (req, res, next) => {
  try {
    const { stallId } = parseOrThrow(
      z.object({ stallId: z.string().trim().min(3).max(64) }),
      req.params,
    );
    const journeyId = typeof req.query.journeyId === "string" ? req.query.journeyId : undefined;

    let ctx: { lat: number | null; lng: number | null; coach: string | null; trainPlatform: string | null } = {
      lat: null,
      lng: null,
      coach: null,
      trainPlatform: null,
    };
    const warnings: string[] = [];

    if (journeyId) {
      const journey = await loadVerifiedJourney(req, journeyId);
      ctx = {
        lat: journey.last_lat,
        lng: journey.last_lng,
        coach: journey.coach,
        trainPlatform: null,
      };
    }

    const detail = await getStallDetail(stallId, ctx);
    if (!detail) throw notFound("Stall not found.");
    warnings.push(...detail.warnings);
    sendOk(res, detail.match, { warnings });
  } catch (error) {
    next(error);
  }
});

/** GET /api/stalls/:stallId/menu */
stallRouter.get("/stalls/:stallId/menu", requireAuth, async (req, res, next) => {
  try {
    const { stallId } = parseOrThrow(
      z.object({ stallId: z.string().trim().min(3).max(64) }),
      req.params,
    );
    const detail = await getStallDetail(stallId, {});
    if (!detail) throw notFound("Stall not found.");
    const items = await getMenuForStall(stallId);
    sendOk(res, { stall: detail.match.stall, items }, { warnings: detail.warnings });
  } catch (error) {
    next(error);
  }
});
