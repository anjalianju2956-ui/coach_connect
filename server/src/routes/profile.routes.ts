import { Router } from "express";
import { getRepo } from "../db";
import { env } from "../config/env";
import { sendOk } from "../lib/response";
import { parseOrThrow } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { profileSchema } from "../validation/schemas";

export const profileRouter = Router();

function tokenOf(req: { auth?: { token?: string } }): string | undefined {
  return req.auth?.token;
}

/** GET /api/profile */
profileRouter.get("/profile", requireAuth, async (req, res, next) => {
  try {
    const repo = getRepo(tokenOf(req));
    const profile = await repo.getProfile(req.auth!.userId);
    sendOk(res, { profile, auth: env.supabase.configured ? "supabase" : "demo" });
  } catch (error) {
    next(error);
  }
});

/** POST /api/profile — create or update the caller's own profile. */
profileRouter.post("/profile", requireAuth, async (req, res, next) => {
  try {
    const body = parseOrThrow(profileSchema, req.body ?? {});
    const repo = getRepo(tokenOf(req));
    const profile = await repo.upsertProfile({
      userId: req.auth!.userId,
      displayName: body.displayName ?? null,
      phone: body.phone ?? req.auth?.phone ?? null,
    });
    sendOk(res, { profile });
  } catch (error) {
    next(error);
  }
});
