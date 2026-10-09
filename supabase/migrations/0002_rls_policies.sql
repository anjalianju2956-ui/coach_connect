-- ============================================================
-- Coach-Connect — Row Level Security
-- Passengers can only read/write their own profiles and journeys.
-- Public catalogue data (stalls, menus) is readable but not writable.
-- ============================================================

alter table public.profiles     enable row level security;
alter table public.journeys     enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.stalls       enable row level security;
alter table public.menu_items   enable row level security;
alter table public.stations_cache enable row level security;

-- ---------------- profiles ----------------
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = user_id);

-- ---------------- journeys ----------------
create policy "journeys_select_own"
  on public.journeys for select
  using (auth.uid() = user_id);

create policy "journeys_insert_own"
  on public.journeys for insert
  with check (auth.uid() = user_id);

create policy "journeys_update_own"
  on public.journeys for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "journeys_delete_own"
  on public.journeys for delete
  using (auth.uid() = user_id);

-- ---------------- catalogue (public read) ----------------
create policy "stalls_public_read"
  on public.stalls for select
  using (is_active = true);

create policy "menu_items_public_read"
  on public.menu_items for select
  using (true);

-- No INSERT/UPDATE/DELETE policies for the catalogue:
-- only the Partner application (service role key) manages this data.

-- ---------------- stations_cache ----------------
create policy "stations_cache_public_read"
  on public.stations_cache for select
  using (true);

-- Writes come from the server using the service-role key (bypasses RLS).
