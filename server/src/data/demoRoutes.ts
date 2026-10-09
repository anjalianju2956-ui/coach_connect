/**
 * DEMO ROUTE DATA — clearly marked, development only.
 *
 * Used when RailKit is not configured (or cannot answer for a train), so the
 * passenger flow stays testable offline.
 *
 * These coordinates/timings are APPROXIMATE and must not be presented as live
 * railway data. Every object derived from here carries `source: "demo"`.
 */

import type { TrainRoute } from "../types";

interface DemoStop {
  code: string;
  name: string;
  lat: number;
  lng: number;
  arr: string | null;
  dep: string | null;
  km: number;
}

const STOP_12951: DemoStop[] = [
  { code: "MMCT", name: "Mumbai Central", lat: 18.969, lng: 72.8205, arr: null, dep: "16:35", km: 0 },
  { code: "BVI", name: "Borivali", lat: 19.2813, lng: 72.8596, arr: "17:02", dep: "17:04", km: 19 },
  { code: "VAPI", name: "Vapi", lat: 20.3719, lng: 72.9083, arr: "18:11", dep: "18:13", km: 118 },
  { code: "ST", name: "Surat", lat: 21.1917, lng: 72.8326, arr: "19:11", dep: "19:13", km: 236 },
  { code: "BRC", name: "Vadodara Jn", lat: 22.3109, lng: 73.1807, arr: "20:30", dep: "20:35", km: 390 },
  { code: "RTM", name: "Ratlam Jn", lat: 23.3181, lng: 75.038, arr: "22:00", dep: "22:03", km: 524 },
  { code: "KOTA", name: "Kota Jn", lat: 25.1795, lng: 75.8441, arr: "01:10", dep: "01:15", km: 904 },
  { code: "SWM", name: "Sawai Madhopur", lat: 26.0173, lng: 76.3477, arr: "02:15", dep: "02:17", km: 1020 },
  { code: "JP", name: "Jaipur Jn", lat: 26.9194, lng: 75.8152, arr: "03:50", dep: "03:55", km: 1125 },
  { code: "AWR", name: "Alwar Jn", lat: 27.5529, lng: 76.6341, arr: "05:15", dep: "05:17", km: 1245 },
  { code: "DEC", name: "Delhi Cantt", lat: 28.5683, lng: 77.133, arr: "06:45", dep: "06:47", km: 1370 },
  { code: "NDLS", name: "New Delhi", lat: 28.6419, lng: 77.2194, arr: "07:10", dep: null, km: 1384 },
];

export const DEMO_ROUTES: Record<string, TrainRoute> = {
  "12951": {
    trainNumber: "12951",
    trainName: "Mumbai Rajdhani Express (DEMO ROUTE)",
    originCode: "MMCT",
    destinationCode: "NDLS",
    stations: STOP_12951.map((stop, index) => ({
      index,
      code: stop.code,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      scheduledArrival: stop.arr,
      scheduledDeparture: stop.dep,
      haltMinutes: stop.arr ? 2 : null,
      distanceFromOriginKm: stop.km,
    })),
    source: "demo",
    fetchedAt: new Date(0).toISOString(),
  },
};

export const DEMO_ROUTE_HINT =
  "Built-in DEMO route available for train 12951 only. Configure RAILKIT_API_KEY to verify any train.";
