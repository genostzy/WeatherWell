-- Review finding (26 September): the app told a too-far report from a
-- rate-limited one by matching this function's English error text, which has
-- been rewritten before. Each refusal now carries a HINT the app matches on
-- instead (too_far, rate_limited); the wording is free to change. Otherwise
-- unchanged from 20260925123429_reputation_and_identity_age.
create or replace function private.enforce_report_geofence_and_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recent_count int;
  v_zone_lat double precision;
  v_zone_lng double precision;
  v_distance_m double precision;
  -- ponytail: equirectangular approximation, not haversine — plenty accurate
  -- at the 15km scale this check operates on, and avoids trig edge cases.
  v_geofence_radius_m constant double precision := 15000;
  v_rate_limit_window constant interval := interval '5 minutes';
begin
  -- Rate limit (layer 2): same reporter, same zone, received within the
  -- window. SQLSTATE P0001, which submitWaterLevelReport treats as
  -- transient, so the outbox retries past the window.
  select count(*) into v_recent_count
  from public.water_level_reports
  where reporter_id = new.reporter_id
    and zone_id = new.zone_id
    and received_at >= now() - v_rate_limit_window;

  if v_recent_count > 0 then
    raise exception 'Too many reports for this zone from this device — wait a few minutes before reporting again.'
      using hint = 'rate_limited';
  end if;

  -- Geofence (layer 1): only when the device supplied a location. A NaN or
  -- infinite coordinate gives a NaN or infinite distance, which Postgres
  -- sorts above any number, so it is refused too.
  if new.lat is not null and new.lng is not null then
    select z.lat, z.lng into v_zone_lat, v_zone_lng
    from public.zones z
    where z.id = new.zone_id;

    if v_zone_lat is not null and v_zone_lng is not null then
      v_distance_m := 111320 * sqrt(
        power(new.lat - v_zone_lat, 2) +
        power((new.lng - v_zone_lng) * cos(radians(v_zone_lat)), 2)
      );

      if v_distance_m > v_geofence_radius_m then
        raise exception 'Report location is too far from the zone being reported.'
          using errcode = '23514', hint = 'too_far';
      end if;
    end if;
  end if;

  return new;
end $$;
