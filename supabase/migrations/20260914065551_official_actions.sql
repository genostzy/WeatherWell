create table public.official_actions (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text not null,
  actor_area  text,
  action      text not null check (action in (
                'alert.set','alert.cleared','centre.status','centre.occupancy',
                'pin.removed','pin.restored','official.appointed','official.removed')),
  zone_id     text references public.zones (id),
  target_id   text,
  detail      jsonb not null default '{}'
);
create index official_actions_zone_time on public.official_actions (zone_id, occurred_at desc);
create index official_actions_time      on public.official_actions (occurred_at desc);

alter table public.official_actions enable row level security;
revoke insert, update, delete, truncate on public.official_actions from anon, authenticated;
grant select on public.official_actions to authenticated;
create policy official_actions_read on public.official_actions
  for select to authenticated
  using ((select private.is_operator()));

-- The only writer. Snapshots the actor's name and area at this moment, so
-- history survives a later rename or removal.
create or replace function private.record_official_action(
  p_action         text,
  p_zone_id        text,
  p_target_id      text,
  p_detail         jsonb,
  p_actor_override text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text;
  v_area text;
begin
  if p_actor_override is not null then
    v_uid  := null;
    v_name := p_actor_override;
  elsif v_uid is null then
    v_name := 'System owner';
  else
    select display_name, area_code into v_name, v_area
      from public.profiles where id = v_uid and role = 'operator';
    -- Should be unreachable: RLS lets only officials make these changes.
    -- Recorded honestly rather than silently dropped if it ever happens.
    if v_name is null then v_name := 'Not an official'; end if;
  end if;

  insert into public.official_actions
    (actor_id, actor_name, actor_area, action, zone_id, target_id, detail)
  values
    (v_uid, v_name, v_area, p_action, p_zone_id, p_target_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke execute on function private.record_official_action(text, text, text, jsonb, text)
  from public, anon, authenticated;

-- alert.set: one entry per inserted alert, carrying what it replaced.
create or replace function private.record_alert_set()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.record_official_action(
    'alert.set', new.zone_id, new.id::text,
    jsonb_build_object('from', new.superseded_severity, 'to', new.severity, 'source', new.source),
    case when (select auth.uid()) is null and new.source <> 'manual'
         then 'Automatic — ' || new.source end);
  return null;
end $$;
create trigger alerts_record_set
  after insert on public.alerts
  for each row execute function private.record_alert_set();

-- alert.cleared: only when the zone ENDS the transaction with no active
-- alert. set_zone_alert deactivates then inserts; recording the deactivation
-- directly would double every change.
create or replace function private.record_alert_cleared()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.alerts where zone_id = new.zone_id and is_active) then
    perform private.record_official_action(
      'alert.cleared', new.zone_id, new.id::text,
      jsonb_build_object('from', old.severity), null);
  end if;
  return null;
end $$;
create constraint trigger alerts_record_cleared
  after update of is_active on public.alerts
  deferrable initially deferred
  for each row
  when (old.is_active and not new.is_active)
  execute function private.record_alert_cleared();

create or replace function private.record_centre_change()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform private.record_official_action('centre.status', new.zone_id, new.id,
      jsonb_build_object('from', old.status, 'to', new.status), null);
  end if;
  if new.current_occupancy is distinct from old.current_occupancy then
    perform private.record_official_action('centre.occupancy', new.zone_id, new.id,
      jsonb_build_object('from', old.current_occupancy, 'to', new.current_occupancy), null);
  end if;
  return null;
end $$;
create trigger centres_record_change
  after update of status, current_occupancy on public.evacuation_centers
  for each row execute function private.record_centre_change();

create or replace function private.record_pin_moderation()
  returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not old.removed and new.removed then
    if new.removed_reason = 'net_score' then
      perform private.record_official_action('pin.removed', new.zone_id, new.id::text,
        jsonb_build_object('reason', 'net_score'), 'Automatic — net score');
    elsif new.removed_reason = 'admin' then
      perform private.record_official_action('pin.removed', new.zone_id, new.id::text,
        jsonb_build_object('reason', 'admin'), null);
    end if;
    -- removed_reason null: the author withdrew their own pin. Not an official action.
  elsif old.removed and not new.removed then
    perform private.record_official_action('pin.restored', new.zone_id, new.id::text,
      '{}'::jsonb, null);
  end if;
  return null;
end $$;
create trigger pins_record_moderation
  after update of removed on public.community_pins
  for each row execute function private.record_pin_moderation();
