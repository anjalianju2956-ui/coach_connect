/**
 * Centralised error types. Every thrown AppError is turned into a consistent
 * JSON envelope by the error middleware.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Authentication required.") =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "You do not have access to this resource.") =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "Resource not found.") =>
  new AppError(404, "NOT_FOUND", message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, "CONFLICT", message, details);

export const tooMany = (message = "Too many requests. Please slow down.") =>
  new AppError(429, "RATE_LIMITED", message);

export const configError = (message: string, details?: unknown) =>
  new AppError(503, "CONFIGURATION_REQUIRED", message, details);

export const upstreamError = (message: string, details?: unknown) =>
  new AppError(502, "UPSTREAM_ERROR", message, details);

export const notImplemented = (message: string, details?: unknown) =>
  new AppError(501, "NOT_IMPLEMENTED", message, details);
