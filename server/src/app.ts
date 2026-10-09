import fs from "fs";
import path from "path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { attachAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";
import { apiRouter } from "./routes";
import { logger } from "./lib/logger";

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      // The SPA is served from this same origin in production.
      contentSecurityPolicy: env.isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // No origin (mobile app, curl, same-origin) is allowed; browsers get
        // restricted to the configured client origin.
        if (!origin) return callback(null, true);
        callback(null, isAllowedOrigin(origin));
      },
      credentials: false,
    }),
  );

  app.use(express.json({ limit: "100kb" }));

  app.use("/api", apiLimiter, attachAuth, apiRouter);
  app.use("/api", notFoundHandler);

  mountSpa(app);
  app.use(errorHandler);

  return app;
}

/**
 * Browser origins allowed to call the API cross-origin.
 *
 * - the configured CLIENT_ORIGIN plus the classic Vite defaults
 * - in development, ANY localhost / 127.0.0.1 port, because Vite happily
 *   moves to 5174/5175 when 5173 is taken (the API is otherwise unreachable
 *   from that tab when the client talks to :4000 directly).
 * - in production only the configured origin (the SPA is same-origin).
 */
function isAllowedOrigin(origin: string): boolean {
  const allowed = [env.clientOrigin, "http://localhost:5173", "http://127.0.0.1:5173"];
  if (allowed.includes(origin)) return true;
  if (env.isProd) return false;
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Serve the built React app from the same origin when `client/dist` exists.
 * In development the Vite dev server proxies /api here instead.
 */
function mountSpa(app: express.Express): void {
  const dist = path.resolve(__dirname, "..", "..", "client", "dist");
  const indexFile = path.join(dist, "index.html");

  if (fs.existsSync(indexFile)) {
    app.use(express.static(dist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexFile);
    });
    return;
  }

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res
      .status(503)
      .type("text/plain")
      .send(
        "Coach-Connect frontend is not built yet.\n\n" +
          "Development: run `npm run dev` and open http://localhost:5173\n" +
          "Production:  run `npm run build` first, then `npm start`.",
      );
  });
}
