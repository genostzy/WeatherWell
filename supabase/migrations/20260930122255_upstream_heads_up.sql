-- When a barangay goes to Warning or Evacuate, the barangay its floodwater
-- reaches next hears first: a heads-up on its officials' dashboard, where
-- town and barangay updates already appear (official_messages). Officials
-- only, by the owner's decision; residents hear when their own officials act
-- (docs/superpowers/specs/2026-09-29-flood-profile-and-downstream-heads-up-design.md).

-- A third direction: to one barangay (zone_id is the downstream barangay,
-- town_code its town), sent by WeatherWell itself.
alter table public.official_messages drop constraint official_messages_direction_check;
alter table public.official_messages add constraint official_messages_direction_check
  check (direction in ('up', 'down', 'heads_up'));
alter table public.official_messages drop constraint official_messages_kind_check;
alter table public.official_messages add constraint official_messages_kind_check
  check (kind in ('centre_full', 'need_help', 'all_clear', 'update', 'upstream_alert'));
alter table public.official_messages drop constraint official_messages_check;
alter table public.official_messages add constraint official_messages_check
  check ((direction in ('up', 'heads_up')) = (zone_id is not null));

-- One heads-up per first Warning or Evacuate: the trigger's WHEN clause leaves
-- out a re-confirmation, Evacuate over Warning, and anything lower. The
-- engine's own advisories are always yellow, so they never send one.
create or replace function private.send_upstream_heads_up()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_up record;
  v_down record;
begin
  select z.name, z.downstream_zone_id into v_up from public.zones z where z.id = new.zone_id;
  if v_up.downstream_zone_id is null then
    return null;
  end if;
  select z.id, z.psgc_barangay_code into v_down from public.zones z where z.id = v_up.downstream_zone_id;
  if not found then
    return null;
  end if;
  insert into public.official_messages (town_code, zone_id, direction, kind, body, sender_name)
  values (left(v_down.psgc_barangay_code, 7), v_down.id, 'heads_up', 'upstream_alert',
          format('%s is under %s.', v_up.name, case new.severity when 'red' then 'Warning' else 'Evacuate' end),
          'WeatherWell');
  return null;
end $$;
revoke execute on function private.send_upstream_heads_up() from public, anon, authenticated;

create trigger alerts_upstream_heads_up
  after insert on public.alerts
  for each row
  when (new.is_active
        and new.severity in ('red', 'evacuate')
        and coalesce(new.superseded_severity, '') not in ('red', 'evacuate'))
  execute function private.send_upstream_heads_up();

-- A town acknowledges a barangay's update, as before; a heads-up is
-- acknowledged by whoever manages its barangay (its officials, its town's,
-- the admin).
create or replace function public.acknowledge_official_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_town text := private.my_town_code();
begin
  update public.official_messages m
     set acknowledged_at = now(),
         acknowledged_by_name = (select p.display_name from public.profiles p where p.id = (select auth.uid()))
   where m.id = p_id
     and m.acknowledged_at is null
     and ((m.direction = 'up' and m.town_code = v_town)
          or (m.direction = 'heads_up' and private.manages_zone(m.zone_id)));
  if not found then
    raise exception using errcode = '42501', message = 'not an update your town can acknowledge';
  end if;
end $$;
