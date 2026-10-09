import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Environment loading.
 *
 * Order of precedence (later wins):
 *   1. `<repo>/.env`
 *   2. `<cwd>/.env`   (so `server/.env` works when you run inside server/)
 *   3. process env
 *
 * Secrets are never logged. Use `envSummary()` for safe diagnostics.
 */

function loadFile(file: string): void {
  if (fs.existsSync(file)) {
    dotenv.config({ path: file, override: false });
  }
}

const repoRoot = path.resolve(__dirname, "..", "..");
loadFile(path.join(repoRoot, ".env"));
loadFile(path.join(process.cwd(), ".env"));

function raw(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed;
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return /^your[_-]/i.test(value.replace(/\s/g, "")) || value.includes("YOUR_");
}

function str(name: string, fallback: string): string {
  return raw(name) ?? fallback;
}

function num(name: string, fallback: number): number {
  const value = raw(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = raw(name);
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const railkitApiKey = raw("RAILKIT_API_KEY");
const supabaseUrl = raw("SUPABASE_URL");
const supabaseAnonKey = raw("SUPABASE_ANON_KEY");
const railkitMonthlyRequestLimit = Math.max(
  0,
  Math.floor(num("RAILKIT_MONTHLY_REQUEST_LIMIT", 50)),
);

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  isProd: str("NODE_ENV", "development") === "production",
  port: num("PORT", 4000),
  clientOrigin: str("CLIENT_ORIGIN", "http://localhost:5173"),
  version: "1.0.0",

  railkit: {
    enabled: bool("RAILKIT_ENABLED", false),
    apiKey: isPlaceholder(railkitApiKey) ? "" : (railkitApiKey ?? ""),
    baseUrl: str("RAILKIT_BASE_URL", "https://api.railkit.in").replace(/\/+$/, ""),
    timeoutMs: Math.max(15_000, num("RAILKIT_TIMEOUT_MS", 15_000)),
    monthlyRequestLimit: railkitMonthlyRequestLimit,
    get configured(): boolean {
      return this.apiKey.length > 0;
    },
  },

  supabase: {
    url: isPlaceholder(supabaseUrl) ? "" : (supabaseUrl ?? ""),
    anonKey: isPlaceholder(supabaseAnonKey) ? "" : (supabaseAnonKey ?? ""),
    serviceRoleKey: raw("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    get configured(): boolean {
      return this.url.length > 0 && this.anonKey.length > 0;
    },
  },

  rules: {
    verifyThreshold: Math.min(Math.max(num("VERIFY_THRESHOLD", 0.65), 0), 1),
    maxOffCorridorKm: num("MAX_OFF_CORRIDOR_KM", 12),
    enableDemoData: bool("ENABLE_DEMO_DATA", true),
  },

  rateLimit: {
    windowMs: num("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    max: num("RATE_LIMIT_MAX", 300),
  },
} as const;

/** Safe, secret-free snapshot used by /api/health and startup logs. */
export function envSummary() {
  return {
    nodeEnv: env.nodeEnv,
    port: env.port,
    supabase: env.supabase.configured,
    railkit: env.railkit.enabled && env.railkit.configured,
    railkitEnabled: env.railkit.enabled,
    demoData: env.rules.enableDemoData,
    verifyThreshold: env.rules.verifyThreshold,
  };
}

/**
 * Small helper so a missing RailKit key produces one clear, actionable error
 * instead of a confusing 401 from the provider.
 */
export function railkitHint(): string {
  if (!env.railkit.enabled) {
    return "RailKit is disabled. Set RAILKIT_ENABLED=true to enable live railway data.";
  }
  return env.railkit.configured
    ? ""
    : "RAILKIT_API_KEY is not set. Add it to your .env (see .env.example) to enable live railway data.";
}
