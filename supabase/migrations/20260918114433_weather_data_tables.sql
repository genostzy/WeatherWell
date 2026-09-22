-- ============================================================
-- Sub-project 1.2: Weather data tables for real PAGASA/weather API integration
-- ============================================================

-- Per-zone, timestamped weather readings. Ingested server-side on a schedule.
create table public.weather_readings (
  id              uuid primary key default gen_random_uuid(),
  zone_id         text not null references public.zones (id) on delete cascade,
  rainfall_mm     real not null default 0,
  wind_kph        real not null default 0,
  temperature_c   real not null default 0,
  humidity_pct    real not null default 0,
  weather_code    integer not null default 0,
  fetched_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Index for "latest reading per zone" queries
create index idx_weather_readings_zone_fetched
  on public.weather_readings (zone_id, fetched_at desc);

-- Only keep 48 hours of readings (one per zone per fetch cycle)
-- Cleaned by a scheduled job; no RLS needed beyond service role
alter table public.weather_readings enable row level security;

create policy "Anyone can read weather readings"
  on public.weather_readings for select
  using (true);

-- Active tropical cyclone track. One row per system, positions stored as JSONB array.
create table public.typhoon_tracks (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  international_name text,
  category        jsonb not null default '{}'::jsonb,
  positions       jsonb not null default '[]'::jsonb,
  is_active       boolean not null default true,
  fetched_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Index for "find active typhoon" query
create index idx_typhoon_tracks_active
  on public.typhoon_tracks (is_active) where is_active = true;

alter table public.typhoon_tracks enable row level security;

create policy "Anyone can read typhoon tracks"
  on public.typhoon_tracks for select
  using (true);

-- Function to clean old weather readings (called by cron/Edge Function)
create or replace function public.cleanup_old_weather_readings()
returns void
language sql
security definer
as $$
  delete from public.weather_readings
  where fetched_at < now() - interval '48 hours';
$$;
