import type { Response } from "express";
import type { ApiSuccess } from "../types";

/** Consistent success envelope: { ok: true, data, meta? } */
export function sendOk<T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200): void {
  const body: ApiSuccess<T> = meta ? { ok: true, data, meta } : { ok: true, data };
  res.status(status).json(body);
}
