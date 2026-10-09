import { Router } from "express";
import { healthRouter } from "./health.routes";
import { journeyRouter } from "./journey.routes";
import { profileRouter } from "./profile.routes";
import { stallRouter } from "./stall.routes";
import { stationRouter } from "./station.routes";
import { trainRouter } from "./train.routes";

/**
 * API surface.
 *
 *   GET  /api/health
 *   GET  /api/trains/:trainNumber
 *   GET  /api/stations/:stationCode
 *   POST /api/journey/verify
 *   GET  /api/journey/active | /api/journey/:id | POST /api/journey/:id/end
 *   GET /api/stalls/next-station | /api/stalls/:id | /api/stalls/:id/menu
 *   GET /api/profile | POST /api/profile
 */
export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(trainRouter);
apiRouter.use(stationRouter);
apiRouter.use(journeyRouter);
apiRouter.use(stallRouter);
apiRouter.use(profileRouter);
