create table public.water_level_reports (
  id           uuid primary key default gen_random_uuid(),
  zone_id      text not null references public.zones (id),
  depth_level  text not null check (depth_level in ('dry','ankle','knee','waist','neck')),
  reporter_id  uuid not null references auth.users (id),
  reported_at  timestamptz not null default now(),
  trust_weight numeric not null default 1.0,
  is_outlier   boolean not null default false
);

create table public.community_pins (
  id             uuid primary key default gen_random_uuid(),
  zone_id        text not null references public.zones (id),
  status_tag     text not null,
  caption        text not null,
  photo_path     text,
  lat            double precision not null,
  lng            double precision not null,
  author_id      uuid not null references auth.users (id),
  created_at     timestamptz not null default now(),
  removed        boolean not null default false,
  removed_reason text check (removed_reason in ('net_score','admin'))
);

create table public.pin_votes (
  pin_id    uuid not null references public.community_pins (id) on delete cascade,
  voter_id  uuid not null references auth.users (id),
  direction smallint not null check (direction in (1, -1)),
  voted_at  timestamptz not null default now(),
  primary key (pin_id, voter_id)
);

create table public.evacuation_check_ins (
  id            uuid primary key default gen_random_uuid(),
  zone_id       text not null references public.zones (id),
  user_id       uuid not null references auth.users (id),
  status        text not null check (status in ('safe','needs_help')),
  checked_in_at timestamptz not null default now(),
  unique (zone_id, user_id)
);

-- Every column a policy or a common filter names.
create index water_level_reports_reporter_id_idx on public.water_level_reports (reporter_id);
create index water_level_reports_zone_time_idx   on public.water_level_reports (zone_id, reported_at desc);
create index community_pins_author_id_idx        on public.community_pins (author_id);
create index community_pins_zone_idx             on public.community_pins (zone_id) where not removed;
create index pin_votes_voter_id_idx              on public.pin_votes (voter_id);
create index evacuation_check_ins_user_id_idx    on public.evacuation_check_ins (user_id);
create index evacuation_check_ins_zone_id_idx    on public.evacuation_check_ins (zone_id);

alter table public.water_level_reports  enable row level security;
alter table public.community_pins       enable row level security;
alter table public.pin_votes            enable row level security;
alter table public.evacuation_check_ins enable row level security;

grant select on public.water_level_reports, public.community_pins, public.pin_votes
  to anon, authenticated;
grant insert on public.water_level_reports to authenticated;
grant insert, update on public.community_pins, public.pin_votes to authenticated;
grant select, insert, update on public.evacuation_check_ins to authenticated;

create policy reports_read on public.water_level_reports
  for select to anon, authenticated using (true);
create policy reports_insert_own on public.water_level_reports
  for insert to authenticated with check ((select auth.uid()) = reporter_id);
-- No update or delete: a report is a historical observation.

create policy pins_read on public.community_pins
  for select to anon, authenticated using (true);
create policy pins_insert_own on public.community_pins
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy pins_update_own_or_operator on public.community_pins
  for update to authenticated
  using      ((select auth.uid()) = author_id or (select private.is_operator()))
  with check ((select auth.uid()) = author_id or (select private.is_operator()));
-- No delete: removal is the soft-delete flag, so restore stays possible.

create policy votes_read on public.pin_votes
  for select to anon, authenticated using (true);
create policy votes_insert_own on public.pin_votes
  for insert to authenticated with check ((select auth.uid()) = voter_id);
create policy votes_update_own on public.pin_votes
  for update to authenticated
  using      ((select auth.uid()) = voter_id)
  with check ((select auth.uid()) = voter_id);

-- Not world-readable: a check-in names a person and says whether they need help.
create policy checkins_read_own_or_operator on public.evacuation_check_ins
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_operator()));
create policy checkins_insert_own on public.evacuation_check_ins
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy checkins_update_own on public.evacuation_check_ins
  for update to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
