import { Router } from "express";
import { env, envSummary } from "../config/env";
import { railkitStatus } from "../services/railkitService";
import { sendOk } from "../lib/response";
import type { HealthReport } from "../types";

export const healthRouter = Router();

/** Liveness + safe configuration report. No secrets are ever returned. */
healthRouter.get("/health", (_req, res) => {
  const railkit = railkitStatus();
  const supabase = env.supabase.configured;

  const report: HealthReport = {
    service: "coach-connect-api",
    status: supabase ? "ok" : "degraded",
    version: env.version,
    time: new Date().toISOString(),
    auth: supabase ? "supabase" : "demo",
    data: {
      supabase,
      railkit: railkit.configured,
      demoData: env.rules.enableDemoData,
    },
  };

  sendOk(res, report, { config: envSummary() });
});
