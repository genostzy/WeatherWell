-- Anti-abuse layers 1-3: geofence and rate limit a water-level report.
--
-- Previously only a comment in submitWaterLevelReport ("Stage 3's geofence
-- and rate limit slot in here"). Enforced in a trigger, not the Server
-- Action, for the same reason honest_report_time() is (see
-- 20260915143824_honest_write_times.sql): RLS/triggers are the backstop a
-- client cannot bypass.

-- The device's own position at submission time, nullable: an offline-queued
-- write from an older build, or a resident who denied location permission,
-- must still be able to file a report — the false negative (skip the
-- geofence check) is far safer than refusing a genuine flood report during
-- exactly the outage this app exists for.
alter table public.water_level_reports
  add column lat double precision,
  add column lng double precision;

grant insert (lat, lng) on public.water_level_reports to authenticated;

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
  -- Rate limit (layer 2-3): same reporter, same zone, within the window.
  -- No explicit errcode: defaults to SQLSTATE P0001, which
  -- submitWaterLevelReport classifies as transient — so the outbox's own
  -- backoff schedule (0/1/5/15/60 min) naturally retries past the window
  -- instead of needing a distinct "reason" wired through the action.
  select count(*) into v_recent_count
  from public.water_level_reports
  where reporter_id = new.reporter_id
    and zone_id = new.zone_id
    and reported_at >= now() - v_rate_limit_window;

  if v_recent_count > 0 then
    raise exception 'Too many reports for this zone from this device — wait a few minutes before reporting again.';
  end if;

  -- Geofence (layer 1): only when the device supplied a location.
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
        -- errcode 23514 (check_violation): submitWaterLevelReport already
        -- classifies this as permanent, the same as REPORT_TOO_OLD's own
        -- reasoning — a device this far away will not become closer by the
        -- outbox simply retrying later.
        raise exception 'Report location is too far from the zone being reported.'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end $$;

create trigger water_level_reports_geofence_and_rate_limit
  before insert on public.water_level_reports
  for each row execute function private.enforce_report_geofence_and_rate_limit();
