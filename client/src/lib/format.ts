/** Small formatting helpers shared across the UI. */

export function formatMoney(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return "—";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  if (meters >= 100) return `${Math.round(meters / 10) * 10} m`;
  return `${Math.round(meters)} m`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatAccuracy(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return "—";
  return `± ${Math.round(meters)} m`;
}

export function formatSpeed(kmph: number | null | undefined): string {
  if (kmph === null || kmph === undefined || !Number.isFinite(kmph)) return "—";
  return `${Math.round(kmph)} km/h`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** "12951" → "12951", allows only digits for train input. */
export function onlyDigits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

/** Normalise an Indian phone number to E.164 (+91XXXXXXXXXX). */
export function normalisePhone(raw: string): { e164: string; error: string | null } {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { e164: "", error: "Enter your mobile number." };

  let national = digits;
  if (digits.length === 12 && digits.startsWith("91")) national = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) national = digits.slice(1);

  if (national.length !== 10) {
    return { e164: "", error: "Enter a valid 10-digit mobile number." };
  }
  if (!/^[6-9]/.test(national)) {
    return { e164: "", error: "Indian mobile numbers start with 6–9." };
  }
  return { e164: `+91${national}`, error: null };
}
