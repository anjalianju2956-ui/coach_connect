import { Router } from "express";
import { z } from "zod";
import { sendOk } from "../lib/response";
import { parseOrThrow } from "../lib/validate";
import { getStation } from "../services/stationService";
import { stationCodeSchema } from "../validation/schemas";

export const stationRouter = Router();

/** GET /api/stations/:stationCode — resolve a station code to name + coords. */
stationRouter.get("/stations/:stationCode", async (req, res, next) => {
  try {
    const { stationCode } = parseOrThrow(
      z.object({ stationCode: stationCodeSchema }),
      req.params,
    );
    const { station, warnings } = await getStation(stationCode);
    sendOk(res, station, { warnings });
  } catch (error) {
    next(error);
  }
});
