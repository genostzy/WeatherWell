create table public.zones (
  id                     text primary key,
  psgc_barangay_code     text not null,
  name                   text not null,
  evacuation_route_text  jsonb not null,
  lat                    double precision not null,
  lng                    double precision not null,
  evacuation_route_path  jsonb not null,
  hotline_number         text not null,
  downstream_zone_id     text references public.zones (id)
);

create table public.evacuation_centers (
  id                text primary key,
  zone_id           text not null unique references public.zones (id),
  name              text not null,
  lat               double precision not null,
  lng               double precision not null,
  capacity          integer not null check (capacity > 0),
  status            text not null default 'space_available'
                      check (status in ('space_available','limited','full')),
  current_occupancy integer check (current_occupancy >= 0)
);

create table public.points_of_interest (
  id       text primary key,
  zone_id  text not null references public.zones (id),
  category text not null check (category in
             ('health_center','pharmacy','market','water_station','barangay_office')),
  name     text not null,
  lat      double precision not null,
  lng      double precision not null
);

create table public.hazard_susceptibility (
  id          text primary key,
  zone_id     text not null references public.zones (id),
  hazard_type text not null check (hazard_type in ('flood','landslide','storm_surge')),
  risk_level  text not null check (risk_level in ('low','medium','high')),
  unique (zone_id, hazard_type)
);

-- Foreign keys are not indexed automatically, and every one of these is a join column.
create index zones_downstream_zone_id_idx     on public.zones (downstream_zone_id);
create index points_of_interest_zone_id_idx   on public.points_of_interest (zone_id);
create index hazard_susceptibility_zone_id_idx on public.hazard_susceptibility (zone_id);

alter table public.zones                 enable row level security;
alter table public.evacuation_centers    enable row level security;
alter table public.points_of_interest    enable row level security;
alter table public.hazard_susceptibility enable row level security;

-- Reachability through the Data API is separate from RLS and is not automatic.
grant select on public.zones, public.evacuation_centers,
                public.points_of_interest, public.hazard_susceptibility
  to anon, authenticated;

-- Read-only to the world. No insert/update/delete policy exists, so all writes
-- are denied for anon and authenticated regardless of the grant above.
create policy zones_read on public.zones
  for select to anon, authenticated using (true);
create policy centers_read on public.evacuation_centers
  for select to anon, authenticated using (true);
create policy pois_read on public.points_of_interest
  for select to anon, authenticated using (true);
create policy hazards_read on public.hazard_susceptibility
  for select to anon, authenticated using (true);
