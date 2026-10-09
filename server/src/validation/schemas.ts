import { z } from "zod";

/**
 * Request validation. Every API body/query passes through one of these
 * before touching business logic.
 */

export const trainNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Train number must be exactly 5 digits (for example 12951).");

export const stationCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,6}$/, "Station code must be 2–6 letters (for example NDLS).");

/** S1, B2, A1, H1, D3, PC, E1 … deliberately flexible. */
export const coachSchema = z
  .string()
  .trim()
  .min(1, "Coach is required.")
  .max(6, "Coach code looks too long.")
  .regex(/^[A-Za-z]{1,2}\d{1,3}[A-Za-z]?$/, "Coach must look like S1, B2, A1 or H1.");

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).default(50),
  speed: z.number().min(0).max(500).nullable().default(null),
  heading: z.number().min(-1).max(360).nullable().default(null),
  timestamp: z.number().int().positive().default(() => Date.now()),
});

export const verifyJourneySchema = z.object({
  trainNumber: trainNumberSchema,
  coach: coachSchema,
  location: locationSchema.optional(),
  presentationDemo: z.boolean().optional(),
  demoStage: z.number().int().min(0).max(3).optional(),
  /** Optional: continue an existing journey instead of starting a new one. */
  journeyId: z.string().trim().min(8).max(64).optional(),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(60).nullable().optional(),
  phone: z.string().trim().min(6).max(20).nullable().optional(),
});

export const nextStationQuerySchema = z.object({
  journeyId: z.string().trim().min(8).max(64),
});
