/**
 * Helpers for dealing with IST-based railway timings without pulling in a
 * date library. Schedule/halt times published by railways are local (IST).
 */

const DEFAULT_TZ_OFFSET_MINUTES = Number(process.env.SCHEDULE_TZ_OFFSET_MINUTES ?? 330);

export function scheduleTimezoneOffsetMinutes(): number {
  return DEFAULT_TZ_OFFSET_MINUTES;
}

/** Minutes since midnight in railway-local time for a given epoch ms. */
export function minutesOfDayLocal(nowMs: number, offsetMinutes = DEFAULT_TZ_OFFSET_MINUTES): number {
  const shifted = nowMs + offsetMinutes * 60_000;
  return ((Math.floor(shifted / 60_000) % 1440) + 1440) % 1440;
}

export function parseHhMm(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Opening-window check that tolerates shifts crossing midnight
 * (e.g. 22:00 → 02:00 means open at 23:30 and at 00:30).
 */
export function isWithinWindow(nowMinutes: number, open?: number | null, close?: number | null): boolean {
  if (open === null || open === undefined || close === null || close === undefined) return true;
  if (open === close) return true;
  if (open < close) return nowMinutes >= open && nowMinutes < close;
  return nowMinutes >= open || nowMinutes < close;
}

export function formatMinutesAsHhMm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
