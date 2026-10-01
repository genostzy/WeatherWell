-- The plan B review (1 October) on the downstream heads-up.
--
-- 1. Only a link an official saved (profile_set_at) sends a heads-up. The
--    three seeded demo links were never anyone's statement, and production's
--    app could not show a heads-up before this release.
-- 2. The heads-up records the barangay that sent it (from_zone_id), so when
--    several barangays drain into one, each Warning's push names its own
--    sender (notifyDownstreamOfficials filters on it).
-- 3. A heads-up that cannot be written is logged and skipped; it never
--    stops the official's Warning from saving.
alter table public.official_messages
  add column from_zone_id text references public.zones (id) on delete set null;

create or replace function private.send_upstream_heads_up()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_up record;
  v_down record;
begin
  select z.name, z.downstream_zone_id, z.profile_set_at into v_up from public.zones z where z.id = new.zone_id;
  if v_up.downstream_zone_id is null or v_up.profile_set_at is null then
    return null;
  end if;
  select z.id, z.psgc_barangay_code into v_down from public.zones z where z.id = v_up.downstream_zone_id;
  if not found then
    return null;
  end if;
  begin
    insert into public.official_messages (town_code, zone_id, from_zone_id, direction, kind, body, sender_name)
    values (left(v_down.psgc_barangay_code, 7), v_down.id, new.zone_id, 'heads_up', 'upstream_alert',
            format('%s is under %s.', v_up.name, case new.severity when 'red' then 'Warning' else 'Evacuate' end),
            'WeatherWell');
  exception when others then
    raise warning 'upstream heads-up from % not written: %', new.zone_id, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function private.send_upstream_heads_up() from public, anon, authenticated;
