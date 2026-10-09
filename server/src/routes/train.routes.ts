import { Router } from "express";
import { sendOk } from "../lib/response";
import { parseOrThrow } from "../lib/validate";
import { assertTrainNumber, getTrainLive, getTrainRoute } from "../services/trainRouteService";
import { z } from "zod";
import { trainNumberSchema } from "../validation/schemas";

export const trainRouter = Router();

/**
 * GET /api/trains/:trainNumber
 * Normalised route + stoppage list for a train.
 * `data.source` is "railkit" or "demo" so the UI can label it honestly.
 */
trainRouter.get("/trains/:trainNumber", async (req, res, next) => {
  try {
    const { trainNumber } = parseOrThrow(
      z.object({ trainNumber: trainNumberSchema }),
      req.params,
    );
    assertTrainNumber(trainNumber);
    const { route, warnings, cached } = await getTrainRoute(trainNumber);
    const live = await getTrainLive(trainNumber);
    sendOk(res, { ...route, liveTrain: live.payload }, {
      warnings: [...new Set([...warnings, ...live.warnings])],
      cached,
      live: live.payload,
    });
  } catch (error) {
    next(error);
  }
});
