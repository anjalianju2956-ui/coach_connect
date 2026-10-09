import { createApp } from "./app";
import { env, envSummary } from "./config/env";
import { logger } from "./lib/logger";

const SCOPE = "server";

function main(): void {
  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info(SCOPE, "Coach-Connect API listening", {
      ...envSummary(),
      port: env.port,
    });
    if (!env.supabase.configured) {
      logger.warn(
        SCOPE,
        "Supabase is not configured — running in DEMO mode (in-memory data, single demo passenger).",
        { hint: "Set SUPABASE_URL and SUPABASE_ANON_KEY in .env" },
      );
    }
    if (!env.railkit.enabled) {
      logger.warn(SCOPE, "RailKit is disabled — railway data uses cached or DEMO routes.", {
        hint: "Set RAILKIT_ENABLED=true to allow RailKit requests.",
      });
    } else if (!env.railkit.configured) {
      logger.warn(SCOPE, "RailKit is not configured — railway data limited to DEMO routes.", {
        hint: "Set RAILKIT_API_KEY in .env",
      });
    }
  });

  const shutdown = (signal: string) => {
    logger.info(SCOPE, `Received ${signal}, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.error(SCOPE, "Unhandled rejection", { reason: String(reason) });
  });
}

main();
