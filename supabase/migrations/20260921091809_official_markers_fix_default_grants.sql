-- The previous migration granted select/insert/delete on official_markers
-- to `authenticated` but never revoked the SELECT/INSERT/UPDATE/DELETE that
-- Supabase's project-level default privileges hand `anon` outright on any
-- newly created public table -- the same gap official_actions had to close
-- after the fact (see harden_appointment_and_action_grants.sql's M8). RLS
-- alone still stopped real data exposure (no policy names `anon`, so its
-- SELECT is silently empty and its INSERT/DELETE are refused outright), but
-- the project's stated principle is that a privilege should not exist at
-- only one of the two independent layers (grant and policy) — proven live
-- by an anon SELECT returning the table (zero rows, but *no error*) where
-- every sibling table refuses it. The table is empty (created moments
-- earlier, nothing has written to it), so it is safe to drop and recreate
-- cleanly rather than alter in place.
drop table public.official_markers;

create table public.official_markers (
  id        uuid primary key default gen_random_uuid(),
  lat       double precision not null,
  lng       double precision not null,
  type      text not null check (type in
              ('flood','road_damage','blocked','power_outage','water_issue','landslide','other')),
  caption   text not null default '',
  placed_by uuid not null references auth.users (id),
  placed_at timestamptz not null default now()
);

create index official_markers_placed_at_idx on public.official_markers (placed_at desc);

alter table public.official_markers enable row level security;

revoke all on public.official_markers from anon, authenticated;
grant select, insert, delete on public.official_markers to authenticated;

create policy official_markers_read on public.official_markers
  for select to authenticated
  using ((select private.is_operator()));

create policy official_markers_insert on public.official_markers
  for insert to authenticated
  with check ((select private.is_operator()) and (select auth.uid()) = placed_by);

create policy official_markers_delete on public.official_markers
  for delete to authenticated
  using ((select private.is_operator()));
