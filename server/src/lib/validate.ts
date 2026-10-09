import type { ZodTypeAny, output } from "zod";
import { badRequest } from "./errors";

/** Parse + validate with Zod, converting failures into a 400 AppError. */
export function parseOrThrow<T extends ZodTypeAny>(schema: T, data: unknown): output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest("Some fields are invalid.", result.error.flatten());
  }
  return result.data;
}
