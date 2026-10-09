-- ============================================================
-- Coach-Connect — DEMO seed data
-- Run AFTER 0001_initial_schema.sql (and 0002_rls_policies.sql).
--
-- Every row below is fictional and marked is_demo = true; the passenger UI
-- labels them "DEMO DATA". They mirror server/src/data/demoStalls.ts, so the
-- same ids behave identically whether the API serves them from memory
-- (no Supabase) or from Postgres (Supabase configured).
--
-- Safe to re-run: every insert is idempotent (on conflict do update).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Stalls
-- ------------------------------------------------------------
insert into public.stalls (
  id, stall_name, description, station_code, station_name, platform,
  latitude, longitude, service_radius, phone, image_url, is_active,
  opening_time, closing_time, rating, prep_time_minutes, is_demo
)
values
  ('demo-stall-bvi-1', 'Chai Point Borivali',
   'Cutting chai, vada pav and quick bites on the platform.',
   'BVI', 'Borivali', '1',
   19.2819, 72.8599, 400, null, null, true, '00:00', '23:59', 4.4, 6, true),

  ('demo-stall-vapi-1', 'Vapi Station Food Plaza',
   'Pure-veg thali, sandwiches and hot beverages.',
   'VAPI', 'Vapi', '1',
   20.3725, 72.9088, 400, null, null, true, '00:00', '23:59', 4.2, 10, true),

  ('demo-stall-st-1', 'Surat Snack Junction',
   'Famous Surat locho, khaman and masala chai.',
   'ST', 'Surat', '2',
   21.1922, 72.8332, 400, null, null, true, '00:00', '23:59', 4.7, 8, true),

  ('demo-stall-st-2', 'Railway Meals Surat',
   'Veg thali, poha, uttapam and packed meals for the journey.',
   'ST', 'Surat', '1',
   21.1911, 72.8318, 400, null, null, true, '05:00', '23:30', 4.1, 12, true),

  ('demo-stall-brc-1', 'Vadodara Kulcha Corner',
   'Amritsari kulcha, chole and lassi served hot.',
   'BRC', 'Vadodara Jn', '3',
   22.3115, 73.1813, 400, null, null, true, '00:00', '23:59', 4.5, 9, true),

  ('demo-stall-kota-1', 'Kota Churma & More',
   'Rajasthani churma, gatte ki sabzi and buttermilk.',
   'KOTA', 'Kota Jn', '2',
   25.18, 75.8447, 400, null, null, true, '00:00', '23:59', 4.3, 11, true),

  ('demo-stall-jp-1', 'Jaipur Pink City Fast Food',
   'Pyaz kachori, masala dahi and cold coffee.',
   'JP', 'Jaipur Jn', '4',
   26.92, 75.8159, 400, null, null, true, '00:00', '23:59', 4.6, 7, true),

  ('demo-stall-ndls-1', 'New Delhi Express Kitchen',
   'North Indian thali, biryani and beverages.',
   'NDLS', 'New Delhi', '6',
   28.6425, 77.22, 400, null, null, true, '04:00', '23:00', 4.4, 14, true)
on conflict (id) do update set
  stall_name       = excluded.stall_name,
  description      = excluded.description,
  station_code     = excluded.station_code,
  station_name     = excluded.station_name,
  platform         = excluded.platform,
  latitude         = excluded.latitude,
  longitude        = excluded.longitude,
  service_radius   = excluded.service_radius,
  is_active        = excluded.is_active,
  opening_time     = excluded.opening_time,
  closing_time     = excluded.closing_time,
  rating           = excluded.rating,
  prep_time_minutes= excluded.prep_time_minutes,
  is_demo          = true;

-- ------------------------------------------------------------
-- Menu items  (id = <stall id>-item-<n>, same numbering as the API)
-- ------------------------------------------------------------
insert into public.menu_items (id, stall_id, name, description, price, is_available, category, is_demo)
values
  -- demo-stall-bvi-1
  ('demo-stall-bvi-1-item-1', 'demo-stall-bvi-1', 'Cutting Chai',   'Small milky tea, station style',        10, true,  'Beverages', true),
  ('demo-stall-bvi-1-item-2', 'demo-stall-bvi-1', 'Masala Chai',    'Ginger-cardamom tea',                   15, true,  'Beverages', true),
  ('demo-stall-bvi-1-item-3', 'demo-stall-bvi-1', 'Vada Pav',       'Potato fritter in a bun with chutney',  20, true,  'Snacks',    true),
  ('demo-stall-bvi-1-item-4', 'demo-stall-bvi-1', 'Samosa (2 pc)',  'Crisp samosas with tamarind chutney',   25, true,  'Snacks',    true),
  ('demo-stall-bvi-1-item-5', 'demo-stall-bvi-1', 'Bun Maska',      'Toasted bun with butter',               20, false, 'Snacks',    true),

  -- demo-stall-vapi-1
  ('demo-stall-vapi-1-item-1', 'demo-stall-vapi-1', 'Veg Thali',        'Dal, sabzi, rice, 3 roti, salad', 90, true, 'Meals',     true),
  ('demo-stall-vapi-1-item-2', 'demo-stall-vapi-1', 'Paneer Sandwich',  'Grilled sandwich with mint mayo', 60, true, 'Snacks',    true),
  ('demo-stall-vapi-1-item-3', 'demo-stall-vapi-1', 'Cutting Chai',     'Small milky tea',                  10, true, 'Beverages', true),
  ('demo-stall-vapi-1-item-4', 'demo-stall-vapi-1', 'Filter Coffee',    'South Indian style coffee',        25, true, 'Beverages', true),
  ('demo-stall-vapi-1-item-5', 'demo-stall-vapi-1', 'Fruit Bowl',       'Seasonal fresh fruit',             45, true, 'Snacks',    true),

  -- demo-stall-st-1
  ('demo-stall-st-1-item-1', 'demo-stall-st-1', 'Locho',          'Steamed gram-flour snack with masala', 30, true, 'Snacks',    true),
  ('demo-stall-st-1-item-2', 'demo-stall-st-1', 'Khaman',         'Soft gram-flour cakes',                25, true, 'Snacks',    true),
  ('demo-stall-st-1-item-3', 'demo-stall-st-1', 'Dabeli',         'Spiced potato filling in a pav',       30, true, 'Snacks',    true),
  ('demo-stall-st-1-item-4', 'demo-stall-st-1', 'Masala Chai',    'Ginger tea',                           15, true, 'Beverages', true),
  ('demo-stall-st-1-item-5', 'demo-stall-st-1', 'Jalebi (100 g)', 'Fresh hot jalebi',                     40, true, 'Sweets',    true),

  -- demo-stall-st-2
  ('demo-stall-st-2-item-1', 'demo-stall-st-2', 'Veg Thali',          'Unlimited style thali with roti, dal, sabzi', 110, true, 'Meals',     true),
  ('demo-stall-st-2-item-2', 'demo-stall-st-2', 'Poha',               'Flattened rice with peanuts and lemon',       35, true, 'Meals',     true),
  ('demo-stall-st-2-item-3', 'demo-stall-st-2', 'Uttapam',            'Thick rice pancake with vegetables',           55, true, 'Meals',     true),
  ('demo-stall-st-2-item-4', 'demo-stall-st-2', 'Packed Lunch Box',   'Sealed veg lunch box with pickle',             95, true, 'Meals',     true),
  ('demo-stall-st-2-item-5', 'demo-stall-st-2', 'Mineral Water 1 L',  'Sealed packaged water',                        20, true, 'Beverages', true),

  -- demo-stall-brc-1
  ('demo-stall-brc-1-item-1', 'demo-stall-brc-1', 'Amritsari Kulcha', 'Stuffed kulcha with chole',           70, true, 'Meals',     true),
  ('demo-stall-brc-1-item-2', 'demo-stall-brc-1', 'Chole',            'Spiced chickpea curry',               50, true, 'Meals',     true),
  ('demo-stall-brc-1-item-3', 'demo-stall-brc-1', 'Sweet Lassi',      'Chilled yoghurt drink',               40, true, 'Beverages', true),
  ('demo-stall-brc-1-item-4', 'demo-stall-brc-1', 'Masala Chai',      'Ginger tea',                          15, true, 'Beverages', true),
  ('demo-stall-brc-1-item-5', 'demo-stall-brc-1', 'Sweet Samosa',     'Fried samosa with chutney',           25, true, 'Snacks',    true),

  -- demo-stall-kota-1
  ('demo-stall-kota-1-item-1', 'demo-stall-kota-1', 'Churma',          'Crushed wheat with ghee and jaggery',  50, true, 'Sweets',    true),
  ('demo-stall-kota-1-item-2', 'demo-stall-kota-1', 'Gatte Ki Sabzi',  'Gram-flour dumplings in curry',        80, true, 'Meals',     true),
  ('demo-stall-kota-1-item-3', 'demo-stall-kota-1', 'Missi Roti',      'Spiced gram-flour bread',              30, true, 'Meals',     true),
  ('demo-stall-kota-1-item-4', 'demo-stall-kota-1', 'Chaas',           'Salted buttermilk',                    20, true, 'Beverages', true),
  ('demo-stall-kota-1-item-5', 'demo-stall-kota-1', 'Kachori (2 pc)',  'Deep-fried stuffed bread',             40, true, 'Snacks',    true),

  -- demo-stall-jp-1
  ('demo-stall-jp-1-item-1', 'demo-stall-jp-1', 'Pyaz Kachori', 'Onion-stuffed flaky kachori',        40, true, 'Snacks',    true),
  ('demo-stall-jp-1-item-2', 'demo-stall-jp-1', 'Masala Dahi',  'Spiced yoghurt with boondi',         30, true, 'Snacks',    true),
  ('demo-stall-jp-1-item-3', 'demo-stall-jp-1', 'Cold Coffee',  'Blended iced coffee',                50, true, 'Beverages', true),
  ('demo-stall-jp-1-item-4', 'demo-stall-jp-1', 'Veg Puff',     'Baked pastry with vegetable filling',35, true, 'Snacks',    true),
  ('demo-stall-jp-1-item-5', 'demo-stall-jp-1', 'Masala Chai',  'Ginger tea',                         15, true, 'Beverages', true),

  -- demo-stall-ndls-1
  ('demo-stall-ndls-1-item-1', 'demo-stall-ndls-1', 'North Indian Thali',   'Dal makhani, sabzi, rice, roti, salad', 130, true, 'Meals',     true),
  ('demo-stall-ndls-1-item-2', 'demo-stall-ndls-1', 'Veg Biryani',          'Fragrant rice with vegetables',         110, true, 'Meals',     true),
  ('demo-stall-ndls-1-item-3', 'demo-stall-ndls-1', 'Rajma Chawal',         'Kidney beans with rice',                 90, true, 'Meals',     true),
  ('demo-stall-ndls-1-item-4', 'demo-stall-ndls-1', 'Sweet Lassi',          'Chilled yoghurt drink',                  45, true, 'Beverages', true),
  ('demo-stall-ndls-1-item-5', 'demo-stall-ndls-1', 'Gulab Jamun (2 pc)',   'Syrup-soaked dumplings',                 40, true, 'Sweets',    true)
on conflict (id) do update set
  name          = excluded.name,
  description   = excluded.description,
  price         = excluded.price,
  is_available  = excluded.is_available,
  category      = excluded.category,
  is_demo       = true;

commit;

-- Friendly summary (psql only): select count(*) from public.stalls where is_demo;
