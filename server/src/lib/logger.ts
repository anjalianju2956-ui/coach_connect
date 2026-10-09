/**
 * Minimal structured logger.
 * Never prints API keys, tokens or raw request bodies containing PII.
 */

const SECRET_KEYS = /(api[_-]?key|authorization|token|password|otp|secret)/i;

function scrub(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEYS.test(key) ? "[redacted]" : scrub(val);
  }
  return out;
}

function line(level: "info" | "warn" | "error", scope: string, message: string, meta?: unknown) {
  const time = new Date().toISOString();
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(scrub(meta))}`;
  const text = `[${time}] ${level.toUpperCase()} [${scope}] ${message}${suffix}`;
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (scope: string, message: string, meta?: unknown) => line("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => line("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: unknown) => line("error", scope, message, meta),
};
