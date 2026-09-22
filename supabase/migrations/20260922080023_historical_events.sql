-- Historical Data Overlay: past disaster occurrences, shown as an optional
-- map layer (see HistoricalEventsLayer). Read-only from the client — there
-- is no admin form for entering these yet, the same deliberate gap
-- appoint_official leaves for officials: populated by hand via the SQL
-- editor for now, not a reason to block the map layer that reads it.
--
-- No rows are seeded here. Fabricating past-event records would be worse
-- than not having the feature — a resident or official could make a real
-- decision off invented history. This ships the capability, empty, ready
-- for real records (PAGASA bulletins, barangay records, DENR-MGB data).
create table public.historical_events (
  id uuid primary key default gen_random_uuid(),
  zone_id text not null references public.zones (id) on delete cascade,
  -- Not a check constraint — mirrors hazard_susceptibility.hazard_type,
  -- which also leaves this to the app-level HazardType union.
  hazard_type text not null,
  event_date date not null,
  severity text not null check (severity = any (array['yellow', 'orange', 'red', 'evacuate'])),
  -- LocalizedText, same shape as alerts.message.
  description jsonb not null default '{"en":"","fil":""}'::jsonb,
  source text,
  created_at timestamptz not null default now()
);

create index historical_events_zone_id_idx on public.historical_events (zone_id);

alter table public.historical_events enable row level security;

create policy "historical_events_read" on public.historical_events for select using (true);

-- Postgres grants anon/authenticated default SELECT/INSERT/UPDATE/DELETE on
-- a new table unless explicitly revoked — the same class of bug
-- official_markers needed a follow-up migration to close (see
-- 20260921091809). Revoke first, then grant only what this table's closest
-- sibling (hazard_susceptibility: public read, writes via service_role/SQL
-- editor only) also grants.
revoke all on public.historical_events from anon, authenticated;
grant select on public.historical_events to anon, authenticated;
