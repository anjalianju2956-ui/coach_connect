-- ============================================================
-- Coach-Connect — initial schema
-- Supabase PostgreSQL
-- Apply with:  supabase db push   (or paste into the SQL editor)
-- ============================================================

create extension if not exists "pgcrypto";

-- Keeps updated_at honest even if a client forgets to set it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- profiles — one row per authenticated passenger
-- ------------------------------------------------------------
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  phone        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- journeys — a passenger's active/ended train journeys
-- ------------------------------------------------------------
create table public.journeys (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  train_number         text not null check (train_number ~ '^[0-9]{5}$'),
  train_name           text,
  coach                text not null check (coach ~ '^[A-Za-z]{1,2}[0-9]{1,3}[A-Za-z]?$'),
  status               text not null default 'ACTIVE' check (status in ('ACTIVE', 'ENDED')),
  verified             boolean not null default false,
  confidence           numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  current_station_code text,
  current_station_name text,
  next_station_code    text,
  next_station_name    text,
  progress_km          double precision,
  direction            smallint not null default 1 check (direction in (-1, 1)),
  last_lat             double precision check (last_lat between -90 and 90),
  last_lng             double precision check (last_lng between -180 and 180),
  last_speed_kmph      double precision,
  last_seen_at         timestamptz,
  sample_count         integer not null default 1,
  route_source         text,
  verify_reason        text,
  started_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  ended_at             timestamptz
);

create index journeys_user_status_idx on public.journeys (user_id, status);
create index journeys_updated_idx     on public.journeys (updated_at desc);

create trigger journeys_set_updated_at
  before update on public.journeys
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- stations_cache — optional cross-instance cache of station lookups.
-- The API currently uses an in-process cache; this table is here so a
-- future multi-instance deployment can share results (requires the
-- service-role key).
-- ------------------------------------------------------------
create table public.stations_cache (
  code       text primary key check (code ~ '^[A-Z]{2,6}$'),
  name       text not null,
  lat        double precision,
  lng        double precision,
  state      text,
  source     text,
  updated_at timestamptz not null default now()
);

create trigger stations_cache_set_updated_at
  before update on public.stations_cache
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- stalls — written later by the Partner website
-- DEMO rows are inserted by seed.sql and flagged is_demo = true.
-- ------------------------------------------------------------
create table public.stalls (
  id               text primary key check (id ~ '^[A-Za-z0-9_-]{3,64}$'),
  stall_name       text not null,
  description      text,
  station_code     text not null check (station_code ~ '^[A-Z]{2,6}$'),
  station_name     text not null,
  platform         text,
  latitude         double precision check (latitude between -90 and 90),
  longitude        double precision check (longitude between -180 and 180),
  service_radius   integer not null default 300 check (service_radius > 0),
  phone            text,
  image_url        text,
  is_active        boolean not null default true,
  opening_time     text check (opening_time is null or opening_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  closing_time     text check (closing_time is null or closing_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  rating           numeric check (rating is null or (rating >= 0 and rating <= 5)),
  prep_time_minutes integer,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index stalls_station_idx  on public.stalls (station_code);
create index stalls_active_idx   on public.stalls (is_active);

create trigger stalls_set_updated_at
  before update on public.stalls
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- menu_items
-- ------------------------------------------------------------
create table public.menu_items (
  id           text primary key check (id ~ '^[A-Za-z0-9_-]{3,64}$'),
  stall_id     text not null references public.stalls (id) on delete cascade,
  name         text not null,
  description  text,
  price        numeric not null check (price >= 0),
  image_url    text,
  is_available boolean not null default true,
  category     text not null default 'General',
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index menu_items_stall_idx on public.menu_items (stall_id);

create trigger menu_items_set_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Legacy orders tables are retained for existing data; passenger access is
-- disabled by the later RLS migration.
-- ------------------------------------------------------------
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  order_number  text not null unique,
  user_id       uuid not null references auth.users (id) on delete cascade,
  stall_id      text not null references public.stalls (id) on delete restrict,
  journey_id    uuid references public.journeys (id) on delete set null,
  train_number  text not null check (train_number ~ '^[0-9]{5}$'),
  coach         text not null,
  station_code  text not null,
  station_name  text not null,
  platform      text,
  status        text not null default 'PLACED'
                check (status in ('PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED')),
  subtotal      numeric not null check (subtotal >= 0),
  fee           numeric not null default 0 check (fee >= 0),
  total         numeric not null check (total >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index orders_user_idx    on public.orders (user_id, created_at desc);
create index orders_stall_idx   on public.orders (stall_id, status);
create index orders_status_idx  on public.orders (status);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  menu_item_id text not null references public.menu_items (id) on delete restrict,
  item_name    text not null,
  quantity     integer not null check (quantity between 1 and 20),
  unit_price   numeric not null check (unit_price >= 0),
  subtotal     numeric not null check (subtotal >= 0)
);

create index order_items_order_idx on public.order_items (order_id);
