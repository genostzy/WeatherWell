-- Idea 10: most barangays have only a placeholder centre. The app now shows
-- nearby schools and halls from OpenStreetMap as "likely sites, not
-- confirmed"; this is how an official confirms one as the barangay's real
-- centre. Officials otherwise have update rights on status and headcount
-- only, and pilot barangays have no centre row at all, so this is the one
-- path that sets a centre's name and place.

alter table public.official_actions drop constraint official_actions_action_check;
alter table public.official_actions add constraint official_actions_action_check
  check (action = any (array['alert.set', 'alert.cleared', 'centre.status', 'centre.occupancy', 'centre.confirmed',
                             'pin.removed', 'pin.restored', 'official.appointed', 'official.removed']));

create or replace function public.confirm_evacuation_center(
  p_zone_id  text,
  p_name     text,
  p_lat      double precision,
  p_lng      double precision,
  p_capacity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zone record;
  v_name text := btrim(coalesce(p_name, ''));
  v_id text;
begin
  if not private.manages_zone(p_zone_id) then
    raise exception using errcode = '42501', message = 'not an official for this barangay';
  end if;
  if length(v_name) = 0 or length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'centre name must be 1-120 characters';
  end if;
  if p_capacity is null or p_capacity < 0 or p_capacity > 100000 then
    raise exception using errcode = '22023', message = 'capacity must be 0-100000';
  end if;

  select z.lat, z.lng into v_zone from public.zones z where z.id = p_zone_id;
  -- Within 5 km of the barangay: the candidates are searched within 2 km,
  -- and a centre residents cannot walk to is not their centre.
  if 111320 * sqrt(power(p_lat - v_zone.lat, 2) + power((p_lng - v_zone.lng) * cos(radians(v_zone.lat)), 2)) > 5000 then
    raise exception using errcode = '22023', message = 'centre must be within 5 km of the barangay';
  end if;

  select c.id into v_id from public.evacuation_centers c where c.zone_id = p_zone_id limit 1;
  if v_id is null then
    v_id := 'center-' || p_zone_id;
    insert into public.evacuation_centers (id, zone_id, name, lat, lng, capacity, status)
    values (v_id, p_zone_id, v_name, p_lat, p_lng, p_capacity, 'unknown');
  else
    update public.evacuation_centers
       set name = v_name, lat = p_lat, lng = p_lng, capacity = p_capacity
     where id = v_id;
  end if;

  perform private.record_official_action('centre.confirmed', p_zone_id, v_id,
    jsonb_build_object('name', v_name, 'capacity', p_capacity), null);
end $$;

revoke execute on function public.confirm_evacuation_center(text, text, double precision, double precision, integer) from public, anon;
grant execute on function public.confirm_evacuation_center(text, text, double precision, double precision, integer) to authenticated;
