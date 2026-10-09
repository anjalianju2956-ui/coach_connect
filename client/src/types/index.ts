/**
 * Types mirrored from the backend API envelope (server/src/types.ts).
 * Keep in sync when the API changes.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type DataSource = "railkit" | "demo" | "cache" | "supabase";

export interface HealthReport {
  service: string;
  status: "ok" | "degraded";
  version: string;
  time: string;
  auth: "supabase" | "demo";
  data: { supabase: boolean; railkit: boolean; demoData: boolean };
}

export interface RouteStation {
  index: number;
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  haltMinutes: number | null;
  distanceFromOriginKm: number | null;
}

export interface TrainRoute {
  trainNumber: string;
  trainName: string;
  originCode: string | null;
  destinationCode: string | null;
  stations: RouteStation[];
  source: DataSource;
  fetchedAt: string;
  liveTrain?: LiveTrainData | null;
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
  score: number;
  weight: number;
  detail: string;
}

export interface StationEta {
  minutes: number | null;
  scheduledTime: string | null;
  note: string;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  threshold: number;
  trainNumber: string;
  coach: string;
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
  status: "ACTIVE" | "ENDED";
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
  last_seen_at: string | null;
  sample_count: number;
  route_source: DataSource | null;
  verify_reason: string | null;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface VerifyResponse {
  journey: Journey;
  verification: VerificationResult;
  liveTrain?: LiveTrainData | null;
  warnings?: string[];
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
  distance_meters: number | null;
  distance_note: string;
  score: number;
  open_now: boolean;
  platform_match: boolean | null;
  reasons: string[];
}

export interface NextStationResponse {
  station: { code: string; name: string };
  context: {
    trainNumber: string;
    coach: string;
    currentStation: string | null;
    currentStationCode: string | null;
    nextStation: string | null;
    nextStationCode: string | null;
    isApproaching: boolean;
  };
  matches: StallMatch[];
}
