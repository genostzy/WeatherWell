-- Official markers: ad-hoc hazard/status pins an appointed official places
-- on the operations map (flood, road damage, blocked, power outage, water
-- issue, landslide, other -- see OFFICIAL_MARKER_TYPES client-side).
--
-- Deliberately NOT zone-scoped: a marker is a free-standing lat/lng note,
-- not tied to a barangay the way an alert or a pin is, and the admin map's
-- other official-only layers (evacuation headcounts, the alert control)
-- already show every zone to every official regardless of their own area --
-- only the ability to WRITE those is scoped by private.manages_zone. This
-- table has no zone_id to scope by, so read/write is simply "any appointed
-- official", matching the map's own existing "see everything" posture for
-- data that isn't zone-bound. A later per-zone restriction is a schema
-- change (adding zone_id, likely derived from a nearest-zone lookup at
-- creation time), not a policy tweak -- tracked as a known follow-up rather
-- than built speculatively here.
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

grant select, insert, delete on public.official_markers to authenticated;

-- Not world-readable: unlike alerts/pins, a marker is a working note between
-- officials (e.g. "power outage — reported by barangay hall"), not
-- resident-facing content. The admin map is the only surface that renders
-- this layer, and it is already behind loadOfficial()'s gate.
create policy official_markers_read on public.official_markers
  for select to authenticated
  using ((select private.is_operator()));

-- placed_by must be the caller's own id: the Server Action never lets a
-- client supply it, but the constraint holds even if that ever changes.
create policy official_markers_insert on public.official_markers
  for insert to authenticated
  with check ((select private.is_operator()) and (select auth.uid()) = placed_by);

-- Any official may remove any marker (matches the map's existing UI, which
-- has never restricted Delete to the placer) -- a hazard note is a shared
-- working annotation, not a personal record like a community pin.
create policy official_markers_delete on public.official_markers
  for delete to authenticated
  using ((select private.is_operator()));
