import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const message = (retryAfterSeconds: number) => ({
  ok: false as const,
  error: {
    code: "RATE_LIMITED",
    message: `Too many requests. Try again in ${retryAfterSeconds}s.`,
  },
});

/** Broad limiter for the whole API. */
export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: message(60),
});

/** Journey verification is expensive (railway lookups) — keep it tight. */
export const verifyLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: message(60),
});
