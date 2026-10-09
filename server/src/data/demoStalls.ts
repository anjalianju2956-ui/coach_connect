/**
 * DEMO STALL / MENU DATA — clearly marked, development only.
 *
 * These are NOT real businesses. Every record carries `is_demo: true` and the
 * UI labels it "DEMO DATA".
 *
 * The table/column layout mirrors the real schema in
 * `supabase/migrations/0001_initial_schema.sql` (and `supabase/seed.sql`
 * inserts these same ids), so swapping in Partner-managed data later is a
 * data change, not a code change.
 */

import type { MenuItem, Stall } from "../types";

const created = "2026-01-01T00:00:00.000Z";

type StallSeed = {
  id: string;
  name: string;
  description: string;
  stationCode: string;
  stationName: string;
  platform: string;
  lat: number;
  lng: number;
  rating: number;
  prep: number;
  opening?: string;
  closing?: string;
};

const STALL_SEEDS: StallSeed[] = [
  {
    id: "demo-stall-bvi-1",
    name: "Chai Point Borivali",
    description: "Cutting chai, vada pav and quick bites on the platform.",
    stationCode: "BVI",
    stationName: "Borivali",
    platform: "1",
    lat: 19.2819,
    lng: 72.8599,
    rating: 4.4,
    prep: 6,
  },
  {
    id: "demo-stall-vapi-1",
    name: "Vapi Station Food Plaza",
    description: "Pure-veg thali, sandwiches and hot beverages.",
    stationCode: "VAPI",
    stationName: "Vapi",
    platform: "1",
    lat: 20.3725,
    lng: 72.9088,
    rating: 4.2,
    prep: 10,
  },
  {
    id: "demo-stall-st-1",
    name: "Surat Snack Junction",
    description: "Famous Surat locho, khaman and masala chai.",
    stationCode: "ST",
    stationName: "Surat",
    platform: "2",
    lat: 21.1922,
    lng: 72.8332,
    rating: 4.7,
    prep: 8,
  },
  {
    id: "demo-stall-st-2",
    name: "Railway Meals Surat",
    description: "Veg thali, poha, uttapam and packed meals for the journey.",
    stationCode: "ST",
    stationName: "Surat",
    platform: "1",
    lat: 21.1911,
    lng: 72.8318,
    rating: 4.1,
    prep: 12,
    opening: "05:00",
    closing: "23:30",
  },
  {
    id: "demo-stall-brc-1",
    name: "Vadodara Kulcha Corner",
    description: "Amritsari kulcha, chole and lassi served hot.",
    stationCode: "BRC",
    stationName: "Vadodara Jn",
    platform: "3",
    lat: 22.3115,
    lng: 73.1813,
    rating: 4.5,
    prep: 9,
  },
  {
    id: "demo-stall-kota-1",
    name: "Kota Churma & More",
    description: "Rajasthani churma, gatte ki sabzi and buttermilk.",
    stationCode: "KOTA",
    stationName: "Kota Jn",
    platform: "2",
    lat: 25.18,
    lng: 75.8447,
    rating: 4.3,
    prep: 11,
  },
  {
    id: "demo-stall-jp-1",
    name: "Jaipur Pink City Fast Food",
    description: "Pyaz kachori, masala dahi and cold coffee.",
    stationCode: "JP",
    stationName: "Jaipur Jn",
    platform: "4",
    lat: 26.92,
    lng: 75.8159,
    rating: 4.6,
    prep: 7,
  },
  {
    id: "demo-stall-ndls-1",
    name: "New Delhi Express Kitchen",
    description: "North Indian thali, biryani and beverages.",
    stationCode: "NDLS",
    stationName: "New Delhi",
    platform: "6",
    lat: 28.6425,
    lng: 77.22,
    rating: 4.4,
    prep: 14,
    opening: "04:00",
    closing: "23:00",
  },
];

export const DEMO_STALLS: Stall[] = STALL_SEEDS.map((seed) => ({
  id: seed.id,
  stall_name: seed.name,
  description: seed.description,
  station_code: seed.stationCode,
  station_name: seed.stationName,
  platform: seed.platform,
  latitude: seed.lat,
  longitude: seed.lng,
  service_radius: 400,
  phone: null,
  image_url: null,
  is_active: true,
  opening_time: seed.opening ?? "00:00",
  closing_time: seed.closing ?? "23:59",
  rating: seed.rating,
  prep_time_minutes: seed.prep,
  is_demo: true,
  created_at: created,
  updated_at: created,
}));

type ItemSeed = [name: string, description: string, price: number, category: string, available?: boolean];

const MENU_SEEDS: Record<string, ItemSeed[]> = {
  "demo-stall-bvi-1": [
    ["Cutting Chai", "Small milky tea, station style", 10, "Beverages"],
    ["Masala Chai", "Ginger-cardamom tea", 15, "Beverages"],
    ["Vada Pav", "Potato fritter in a bun with chutney", 20, "Snacks"],
    ["Samosa (2 pc)", "Crisp samosas with tamarind chutney", 25, "Snacks"],
    ["Bun Maska", "Toasted bun with butter", 20, "Snacks", false],
  ],
  "demo-stall-vapi-1": [
    ["Veg Thali", "Dal, sabzi, rice, 3 roti, salad", 90, "Meals"],
    ["Paneer Sandwich", "Grilled sandwich with mint mayo", 60, "Snacks"],
    ["Cutting Chai", "Small milky tea", 10, "Beverages"],
    ["Filter Coffee", "South Indian style coffee", 25, "Beverages"],
    ["Fruit Bowl", "Seasonal fresh fruit", 45, "Snacks"],
  ],
  "demo-stall-st-1": [
    ["Locho", "Steamed gram-flour snack with masala", 30, "Snacks"],
    ["Khaman", "Soft gram-flour cakes", 25, "Snacks"],
    ["Dabeli", "Spiced potato filling in a pav", 30, "Snacks"],
    ["Masala Chai", "Ginger tea", 15, "Beverages"],
    ["Jalebi (100 g)", "Fresh hot jalebi", 40, "Sweets"],
  ],
  "demo-stall-st-2": [
    ["Veg Thali", "Unlimited style thali with roti, dal, sabzi", 110, "Meals"],
    ["Poha", "Flattened rice with peanuts and lemon", 35, "Meals"],
    ["Uttapam", "Thick rice pancake with vegetables", 55, "Meals"],
    ["Packed Lunch Box", "Sealed veg lunch box with pickle", 95, "Meals"],
    ["Mineral Water 1 L", "Sealed packaged water", 20, "Beverages"],
  ],
  "demo-stall-brc-1": [
    ["Amritsari Kulcha", "Stuffed kulcha with chole", 70, "Meals"],
    ["Chole", "Spiced chickpea curry", 50, "Meals"],
    ["Sweet Lassi", "Chilled yoghurt drink", 40, "Beverages"],
    ["Masala Chai", "Ginger tea", 15, "Beverages"],
    ["Sweet Samosa", "Fried samosa with chutney", 25, "Snacks"],
  ],
  "demo-stall-kota-1": [
    ["Churma", "Crushed wheat with ghee and jaggery", 50, "Sweets"],
    ["Gatte Ki Sabzi", "Gram-flour dumplings in curry", 80, "Meals"],
    ["Missi Roti", "Spiced gram-flour bread", 30, "Meals"],
    ["Chaas", "Salted buttermilk", 20, "Beverages"],
    ["Kachori (2 pc)", "Deep-fried stuffed bread", 40, "Snacks"],
  ],
  "demo-stall-jp-1": [
    ["Pyaz Kachori", "Onion-stuffed flaky kachori", 40, "Snacks"],
    ["Masala Dahi", "Spiced yoghurt with boondi", 30, "Snacks"],
    ["Cold Coffee", "Blended iced coffee", 50, "Beverages"],
    ["Veg Puff", "Baked pastry with vegetable filling", 35, "Snacks"],
    ["Masala Chai", "Ginger tea", 15, "Beverages"],
  ],
  "demo-stall-ndls-1": [
    ["North Indian Thali", "Dal makhani, sabzi, rice, roti, salad", 130, "Meals"],
    ["Veg Biryani", "Fragrant rice with vegetables", 110, "Meals"],
    ["Rajma Chawal", "Kidney beans with rice", 90, "Meals"],
    ["Sweet Lassi", "Chilled yoghurt drink", 45, "Beverages"],
    ["Gulab Jamun (2 pc)", "Syrup-soaked dumplings", 40, "Sweets"],
  ],
};

let cached: MenuItem[] | null = null;

export function demoMenuItems(): MenuItem[] {
  if (cached) return cached;
  const items: MenuItem[] = [];
  for (const stall of DEMO_STALLS) {
    const seeds = MENU_SEEDS[stall.id] ?? [];
    seeds.forEach((seed, index) => {
      const [name, description, price, category, available] = seed;
      items.push({
        id: `${stall.id}-item-${index + 1}`,
        stall_id: stall.id,
        name,
        description,
        price,
        image_url: null,
        is_available: available ?? true,
        category,
        is_demo: true,
        created_at: created,
        updated_at: created,
      });
    });
  }
  cached = items;
  return items;
}
