-- Officials set their barangay's flood profile: its flood, landslide and
-- storm-surge levels, and the barangay its floodwater reaches next
-- (docs/superpowers/specs/2026-09-29-flood-profile-and-downstream-heads-up-design.md).
-- Every hazard row was 'unknown' and only 3 barangays had a downstream link.

-- When an official last saved the profile; /api/barangay-profiles serves
-- only these barangays, as /api/barangay-details serves details_set_at.
alter table public.zones add column profile_set_at timestamptz;

-- The same check as set_barangay_details (private.manages_zone: the
-- barangay's officials, its town's, and the admin). The downstream barangay
-- must be another one within 20 km, by the report geofence's distance.
create or replace function public.set_barangay_profile(
  p_zone_id text,
  p_flood text,
  p_landslide text,
  p_storm_surge text,
  p_downstream_zone_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
  v_lat double precision;
  v_lng double precision;
  v_down record;
begin
  if not private.manages_zone(p_zone_id) then
    raise exception using errcode = '42501', message = 'not an official for this barangay';
  end if;
  foreach v_level in array array[p_flood, p_landslide, p_storm_surge] loop
    if v_level is null or v_level not in ('low', 'medium', 'high', 'unknown') then
      raise exception using errcode = '22023', message = 'unknown hazard level';
    end if;
  end loop;

  if p_downstream_zone_id is not null then
    if p_downstream_zone_id = p_zone_id then
      raise exception using errcode = '22023', message = 'a barangay cannot be downstream of itself';
    end if;
    select z.lat, z.lng into v_lat, v_lng from public.zones z where z.id = p_zone_id;
    select z.lat, z.lng into v_down from public.zones z where z.id = p_downstream_zone_id;
    if not found then
      raise exception using errcode = '22023', message = 'no such barangay';
    end if;
    if not (111320 * sqrt(
              power(v_down.lat - v_lat, 2) +
              power((v_down.lng - v_lng) * cos(radians(v_lat)), 2)) <= 20000) then
      raise exception using errcode = '22023', message = 'the downstream barangay must be within 20 km';
    end if;
  end if;

  -- About 11,700 barangay-hazard pairs have no row yet; saving creates them.
  insert into public.hazard_susceptibility (id, zone_id, hazard_type, risk_level)
  values (p_zone_id || '-flood', p_zone_id, 'flood', p_flood),
         (p_zone_id || '-landslide', p_zone_id, 'landslide', p_landslide),
         (p_zone_id || '-storm_surge', p_zone_id, 'storm_surge', p_storm_surge)
  on conflict (id) do update set risk_level = excluded.risk_level;

  update public.zones
     set downstream_zone_id = p_downstream_zone_id,
         profile_set_at = now()
   where id = p_zone_id;

  perform private.record_official_action('barangay.profile', p_zone_id, p_zone_id,
    jsonb_build_object('flood', p_flood, 'landslide', p_landslide, 'storm_surge', p_storm_surge,
                       'downstream', p_downstream_zone_id));

  return jsonb_build_object('id', p_zone_id, 'flood', p_flood, 'landslide', p_landslide,
    'storm_surge', p_storm_surge, 'downstream_zone_id', p_downstream_zone_id);
end $$;

revoke execute on function public.set_barangay_profile(text, text, text, text, text) from public, anon;
grant execute on function public.set_barangay_profile(text, text, text, text, text) to authenticated;
