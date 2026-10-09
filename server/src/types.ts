/**
 * Shared domain types for the Coach-Connect backend.
 * Keep this file free of runtime logic — it is imported everywhere.
 */

export type DataSource = "railkit" | "demo" | "cache" | "supabase";

export type JourneyStatus = "ACTIVE" | "ENDED";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** A single station in a train's route, in running order. */
export interface RouteStation {
  index: number;
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  /** Scheduled arrival, "HH:mm" in station-local time when known. */
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  haltMinutes: number | null;
  /** Cumulative km from origin when the provider supplies it. */
  distanceFromOriginKm: number | null;
}

export interface TrainRoute {
  trainNumber: string;
  trainName: string;
  originCode: string | null;
  destinationCode: string | null;
  stations: RouteStation[];
  /** Which provider produced this route — never pretend demo data is live. */
  source: DataSource;
  fetchedAt: string;
}

export interface LiveTrainStation {
  code: string | null;
  name: string | null;
  lat: number | null;
  lng: number | null;
}

export interface LiveTrainData {
  trainNumber: string;
  trainName: string | null;
  currentLocation: LiveTrainStation | null;
  nextStation: LiveTrainStation | null;
  distanceToNextStationKm: number | null;
  delayMinutes: number | null;
  speedKmph: number | null;
  etaMinutes: number | null;
  route: unknown | null;
  coachPosition: unknown | null;
  source: "RAILKIT" | "DEMO";
  cached: boolean;
}

export interface Station {
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  state: string | null;
  source: DataSource;
}

/** One browser geolocation reading, normalised by the API. */
export interface LocationSample {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export interface VerificationSignal {
  key: string;
  label: string;
  /** 0..1 */
  score: number;
  /** relative weight of this signal */
  weight: number;
  detail: string;
}

export interface StationEta {
  minutes: number | null;
  scheduledTime: string | null;
  /** Always surfaced to the UI — ETA is an estimate, not a promise. */
  note: string;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  threshold: number;
  trainNumber: string;
  coach: string;
  /** Distinguishes "we saw a location" from "we trust the journey". */
  locationDetected: boolean;
  currentStation: RouteStation | null;
  nextStation: RouteStation | null;
  direction: 1 | -1;
  progressKm: number | null;
  nearestStationCode: string | null;
  nearestStationDistanceM: number | null;
  corridorDistanceM: number | null;
  distanceToNextStationKm: number | null;
  speedKmph: number | null;
  eta: StationEta | null;
  signals: VerificationSignal[];
  reason: string;
  warnings: string[];
  routeSource: DataSource;
  evaluatedAt: string;
}

export interface Journey {
  id: string;
  user_id: string;
  train_number: string;
  train_name: string | null;
  coach: string;
  status: JourneyStatus;
  verified: boolean;
  confidence: number;
  current_station_code: string | null;
  current_station_name: string | null;
  next_station_code: string | null;
  next_station_name: string | null;
  progress_km: number | null;
  direction: 1 | -1;
  last_lat: number | null;
  last_lng: number | null;
  last_speed_kmph: number | null;
  /** Timestamp of the most recent location sample, used to derive speed. */
  last_seen_at: string | null;
  sample_count: number;
  route_source: DataSource | null;
  verify_reason: string | null;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface Profile {
  id: string;
  user_id: string;
  phone: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Stall {
  id: string;
  stall_name: string;
  description: string | null;
  station_code: string;
  station_name: string;
  platform: string | null;
  latitude: number | null;
  longitude: number | null;
  service_radius: number;
  phone: string | null;
  image_url: string | null;
  is_active: boolean;
  opening_time: string | null;
  closing_time: string | null;
  rating: number | null;
  prep_time_minutes: number | null;
  /** true when this row comes from local DEMO seed data, not a partner. */
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  stall_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  category: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface StallMatch {
  stall: Stall;
  /** Straight-line estimate; clearly flagged as approximate in the UI. */
  distance_meters: number | null;
  distance_note: string;
  /** 0..1 recommendation score for ordering/ranking. */
  score: number;
  open_now: boolean;
  platform_match: boolean | null;
  reasons: string[];
}

/* ------------------------------ API envelope ------------------------------ */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | { ok: false; error: ApiErrorBody };

export interface HealthReport {
  service: string;
  status: "ok" | "degraded";
  version: string;
  time: string;
  auth: "supabase" | "demo";
  data: {
    supabase: boolean;
    railkit: boolean;
    demoData: boolean;
  };
}
