-- Sub-project 1, section 5 and correction 4. A subscription without a
-- barangay received every barangay's alerts. 0 rows exist today, so the
-- column can become NOT NULL directly. "on delete set null" contradicts
-- NOT NULL, so a deleted zone now takes its subscriptions with it.
alter table public.push_subscriptions drop constraint push_subscriptions_zone_id_fkey;
alter table public.push_subscriptions
  add constraint push_subscriptions_zone_id_fkey
  foreign key (zone_id) references public.zones (id) on delete cascade;
alter table public.push_subscriptions alter column zone_id set not null;

drop index if exists public.push_subscriptions_zone_idx;
create index push_subscriptions_zone_idx on public.push_subscriptions (zone_id);
