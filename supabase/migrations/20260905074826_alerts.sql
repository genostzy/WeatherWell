create table public.alerts (
  id                  uuid primary key default gen_random_uuid(),
  zone_id             text not null references public.zones (id),
  severity            text not null check (severity in ('yellow','orange','red','evacuate')),
  message             jsonb not null,
  source              text not null check (source in
                        ('manual','auto_crowdsourced','predicted','cascade')),
  confidence          text not null default 'estimated'
                        check (confidence in ('estimated','validated','calibrated')),
  predicted_timing    jsonb,
  issued_at           timestamptz not null default now(),
  issued_by           uuid references auth.users (id),
  is_active           boolean not null default true,
  superseded_at       timestamptz,
  -- The severity this row replaced. Lets the downgrade notice read one row
  -- instead of walking history.
  superseded_severity text check (superseded_severity in
                        ('yellow','orange','red','evacuate'))
);

-- The invariant the client's resolveEffectiveAlert used to emulate.
create unique index alerts_one_active_per_zone on public.alerts (zone_id) where is_active;

-- Reads are "active alerts, plus recently superseded ones for the notice".
create index alerts_zone_superseded_idx on public.alerts (zone_id, superseded_at desc)
  where superseded_at is not null;

alter table public.alerts enable row level security;
grant select on public.alerts to anon, authenticated;
grant insert, update on public.alerts to authenticated;

create policy alerts_read on public.alerts
  for select to anon, authenticated using (true);

create policy alerts_write_operator on public.alerts
  for insert to authenticated
  with check ((select private.is_operator()));

create policy alerts_update_operator on public.alerts
  for update to authenticated
  using      ((select private.is_operator()))
  with check ((select private.is_operator()));
