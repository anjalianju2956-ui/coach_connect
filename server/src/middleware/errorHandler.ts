import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { env } from "../config/env";

/**
 * Centralised error handling.
 * Every failure leaves the API as:
 *   { ok: false, error: { code, message, details? } }
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: { code: "ROUTE_NOT_FOUND", message: `No API route matches ${req.method} ${req.path}.` },
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Some fields are invalid.",
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.status >= 500) {
      logger.error("api", error.message, { code: error.code, path: req.path });
    }
    res.status(error.status).json({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  logger.error("api", message, { path: req.path, stack: env.isProd ? undefined : (error as Error)?.stack });

  res.status(500).json({
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on the server. Please try again.",
    },
  });
}
