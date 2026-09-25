-- Stage 4 (mvp): anti-abuse layer 6 (reputation), identity-age hardening,
-- and two holes the abuse-attempt suite (supabase/tests/abuse.sql) found in
-- layers 2 and 4.
--
-- Layer 6: a device whose flood reports helped raise automatic advisories
-- that officials confirmed counts for more; one whose advisories were
-- rejected more often than confirmed counts for nothing until a confirmed one
-- evens it out.
--
-- Identity age (device-fingerprint hardening without collecting anything
-- new): clearing a browser's storage makes a new anonymous identity, so one
-- person can pose as many devices. An identity made less than a day before
-- its report earns no bonuses and cannot set the outlier consensus, and the
-- engine needs at least one reporter whose identity is over a day old.

-- 1. The verdict an official gives an automatic advisory. No client grant:
-- only the trigger and function below write it.
alter table public.alerts
  add column verdict text check (verdict in ('confirmed', 'rejected'));

-- Confirmed: an official replaced the engine's advisory with their own.
-- set_zone_alert supersedes the old alert and inserts the new one in one
-- transaction, so the two share now().
create or replace function private.confirm_superseded_advisory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.alerts
     set verdict = 'confirmed'
   where zone_id = new.zone_id
     and source = 'auto_crowdsourced'
     and superseded_at = new.issued_at
     and verdict is null;
  return null;
end $$;

revoke execute on function private.confirm_superseded_advisory() from public, anon, authenticated;

create trigger alerts_confirm_superseded_advisory
  after insert on public.alerts
  for each row when (new.source = 'manual')
  execute function private.confirm_superseded_advisory();

-- Rejected: an official says the engine's advisory is wrong. A plain clear
-- (set_zone_alert with no severity) records no verdict, since an all-clear
-- after the water goes down says nothing about the reports.
create or replace function public.reject_automatic_alert(p_zone_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.manages_zone(p_zone_id) then
    raise exception using errcode = '42501', message = 'not an official for this barangay';
  end if;

  update public.alerts
     set is_active = false, superseded_at = now(), verdict = 'rejected'
   where zone_id = p_zone_id and is_active and source = 'auto_crowdsourced';

  if not found then
    raise exception using errcode = 'P0002', message = 'There is no automatic advisory here to reject.';
  end if;
end $$;

revoke execute on function public.reject_automatic_alert(text) from public, anon;
grant execute on function public.reject_automatic_alert(text) to authenticated;

-- 2. Whether a report's identity was over a day old when it was made. Public,
-- like trust_weight, so the app's own count can mirror the engine's.
alter table public.water_level_reports
  add column reporter_established boolean not null default false;

grant select (reporter_established) on public.water_level_reports to anon, authenticated;

update public.water_level_reports r
   set reporter_established = true
  from auth.users u
 where u.id = r.reporter_id
   and u.created_at <= r.reported_at - interval '24 hours';

-- 3. Layer 2: the rate limit read reported_at, which the client sends (an
-- offline report keeps the time it was made). Backdating each report past
-- the 5-minute window let one device file without limit. It now reads when
-- the database received the report.
alter table public.water_level_reports add column received_at timestamptz;
update public.water_level_reports set received_at = reported_at;
alter table public.water_level_reports
  alter column received_at set default now(),
  alter column received_at set not null;

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
    raise exception 'Too many reports for this zone from this device — wait a few minutes before reporting again.';
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
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end $$;

-- 4. Scoring at insert.
--   0.2  any device
--  +0.3  checked in to this barangay         } only for an identity
--  +0.2  has a report more than a day old    } over a day old
--  +0.3  an earlier report was corroborated  }
--  +0.3  its advisories were confirmed more often than rejected
--   = 0  its advisories were rejected more often than confirmed
--  capped at 1.0.
-- Outlier (layer 4): three or more levels away from the most common depth
-- among at least two other established, counting reporters' latest located
-- reports in the last hour. One report per reporter, so one device's repeats
-- cannot make a consensus, and established reporters only, so a swarm of new
-- identities cannot redefine it and push real reports out as outliers.
create or replace function private.score_water_level_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank constant jsonb := '{"dry":0,"ankle":1,"knee":2,"waist":3,"neck":4}';
  v_weight numeric := 0.2;
  v_confirmed int := 0;
  v_rejected int := 0;
  v_mode text;
  v_others int;
begin
  if new.reporter_id is not null then
    new.reporter_established := exists (
      select 1 from auth.users u
       where u.id = new.reporter_id
         and u.created_at <= new.reported_at - interval '24 hours');

    if new.reporter_established then
      if exists (select 1 from public.evacuation_check_ins c
                  where c.user_id = new.reporter_id and c.zone_id = new.zone_id) then
        v_weight := v_weight + 0.3;
      end if;
      if exists (select 1 from public.water_level_reports r
                  where r.reporter_id = new.reporter_id and r.reported_at < now() - interval '24 hours') then
        v_weight := v_weight + 0.2;
      end if;
      if exists (
        select 1
          from public.water_level_reports mine
          join public.water_level_reports other
            on other.zone_id = mine.zone_id
           and other.reporter_id <> mine.reporter_id
           and other.reported_at between mine.reported_at - interval '1 hour' and mine.reported_at + interval '1 hour'
           and abs((v_rank ->> other.depth_level)::int - (v_rank ->> mine.depth_level)::int) <= 1
         where mine.reporter_id = new.reporter_id
           and mine.reported_at < now() - interval '1 hour'
      ) then
        v_weight := v_weight + 0.3;
      end if;
    end if;

    -- Layer 6: verdicts on advisories this device's flood reports helped
    -- raise: the reports the engine counts, in the 6 hours before it.
    select count(*) filter (where a.verdict = 'confirmed'),
           count(*) filter (where a.verdict = 'rejected')
      into v_confirmed, v_rejected
      from public.alerts a
     where a.source = 'auto_crowdsourced'
       and a.verdict is not null
       and exists (
         select 1 from public.water_level_reports r
          where r.reporter_id = new.reporter_id
            and r.zone_id = a.zone_id
            and r.reported_at between a.issued_at - interval '6 hours' and a.issued_at
            and r.depth_level <> 'dry'
            and not r.is_outlier
            and r.lat is not null and r.lng is not null);
    if v_confirmed > v_rejected then
      v_weight := v_weight + 0.3;
    end if;
  end if;
  new.trust_weight := case when v_rejected > v_confirmed then 0 else least(v_weight, 1.0) end;

  select mode() within group (order by latest.depth_level), count(*)
    into v_mode, v_others
    from (select distinct on (r.reporter_id) r.depth_level
            from public.water_level_reports r
           where r.zone_id = new.zone_id
             and r.reported_at >= now() - interval '1 hour'
             and r.reporter_id is distinct from new.reporter_id
             and r.lat is not null and r.lng is not null
             and r.reporter_established
             and r.trust_weight > 0
             and not r.is_outlier
           order by r.reporter_id, r.reported_at desc) latest;
  new.is_outlier := v_others >= 2
    and abs((v_rank ->> new.depth_level)::int - (v_rank ->> v_mode)::int) >= 3;

  return new;
end $$;

revoke execute on function private.score_water_level_report() from public, anon, authenticated;

-- 5. The engine: 3 distinct located reporters that count (weight above 0),
-- a combined trust of at least 1.0, and at least one established reporter.
create or replace function public.check_and_trigger_alerts()
 returns table(zone_id text, severity text, report_count bigint, triggered boolean)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_min_reporters constant int := 3;
  v_min_trust constant numeric := 1.0;
  v_window constant interval := interval '6 hours';
  v_zone record;
  v_since timestamptz;
  v_count bigint;
  v_established bigint;
  v_trust numeric;
  v_depth text;
  v_depth_en text;
  v_depth_fil text;
begin
  -- Withdraw this engine's own alerts whose evidence has aged out.
  update public.alerts al
     set is_active = false, superseded_at = now(), expired_automatically = true
   where al.is_active
     and al.source = 'auto_crowdsourced'
     and (select count(distinct r.reporter_id)
            from public.water_level_reports r
           where r.zone_id = al.zone_id
             and r.reported_at >= now() - v_window
             and not r.is_outlier
             and r.trust_weight > 0
             and r.lat is not null and r.lng is not null
             and r.depth_level <> 'dry') < v_min_reporters;

  for v_zone in
    select distinct r.zone_id as id
      from public.water_level_reports r
     where r.reported_at >= now() - v_window
       and not r.is_outlier
       and r.trust_weight > 0
       and r.lat is not null and r.lng is not null
       and r.depth_level <> 'dry'
  loop
    if exists (select 1 from public.alerts al where al.zone_id = v_zone.id and al.is_active) then
      zone_id := v_zone.id; severity := null; report_count := 0; triggered := false;
      return next;
      continue;
    end if;

    -- The engine's own entries are recorded as "Automatic — <…>" by
    -- private.record_alert_set / record_alert_cleared; every other
    -- alert.set/alert.cleared is a human decision.
    select max(o.occurred_at) into v_since
      from public.official_actions o
     where o.zone_id = v_zone.id
       and o.action in ('alert.set', 'alert.cleared')
       and o.actor_name not like 'Automatic%';

    select count(distinct r.reporter_id),
           count(distinct r.reporter_id) filter (where r.reporter_established),
           mode() within group (order by r.depth_level)
      into v_count, v_established, v_depth
      from public.water_level_reports r
     where r.zone_id = v_zone.id
       and r.reported_at >= now() - v_window
       and (v_since is null or r.reported_at > v_since)
       and not r.is_outlier
       and r.trust_weight > 0
       and r.lat is not null and r.lng is not null
       and r.depth_level <> 'dry';

    select coalesce(sum(best), 0) into v_trust
      from (select max(r.trust_weight) as best
              from public.water_level_reports r
             where r.zone_id = v_zone.id
               and r.reported_at >= now() - v_window
               and (v_since is null or r.reported_at > v_since)
               and not r.is_outlier
               and r.trust_weight > 0
               and r.lat is not null and r.lng is not null
               and r.depth_level <> 'dry'
             group by r.reporter_id) per_reporter;

    if v_count < v_min_reporters or v_trust < v_min_trust or v_established = 0 then
      zone_id := v_zone.id; severity := null; report_count := v_count; triggered := false;
      return next;
      continue;
    end if;

    v_depth_en := case v_depth
      when 'ankle' then 'ankle-deep' when 'knee' then 'knee-deep'
      when 'waist' then 'waist-deep' when 'neck' then 'neck-deep' end;
    v_depth_fil := case v_depth
      when 'ankle' then 'hanggang bukong-bukong' when 'knee' then 'hanggang tuhod'
      when 'waist' then 'hanggang baywang' when 'neck' then 'hanggang leeg' end;

    perform public.set_zone_alert(
      v_zone.id,
      'yellow',
      jsonb_build_object(
        'en', format('Advisory — %s residents report %s water (unverified).', v_count, v_depth_en),
        'fil', format('Paalala — %s residente ang nag-ulat ng tubig na %s (hindi pa kumpirmado).', v_count, v_depth_fil)
      ),
      'auto_crowdsourced'
    );

    zone_id := v_zone.id; severity := 'yellow'; report_count := v_count; triggered := true;
    return next;
  end loop;
end;
$function$;
