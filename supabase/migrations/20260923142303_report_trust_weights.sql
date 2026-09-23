-- Idea 3: trust_weight and is_outlier existed but nothing filled them, so
-- every report counted 1.0 and none was ever an outlier. Both are now set by
-- the database at insert (clients have no grant on either column).
--
-- Trust, from what a device has actually done:
--   0.2  any device, including a brand-new anonymous one
--  +0.3  it has checked in to this barangay before
--  +0.2  it has a report more than a day old (a device with history)
--  +0.3  an earlier report of its (over an hour old) was corroborated by
--        another reporter in the same barangay within an hour, at a depth
--        within one level
--  capped at 1.0.
-- ponytail: corroboration does not stop one person's many devices vouching
-- for each other after an hour; the check-in and history terms raise that
-- cost, and officials confirm or reject every automatic advisory.
--
-- Outlier: two or more depth levels away from the most common depth among
-- at least two other reporters' reports in the last hour. Judged only
-- against earlier reports; a later majority does not re-mark it.

create or replace function private.score_water_level_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank constant jsonb := '{"dry":0,"ankle":1,"knee":2,"waist":3,"neck":4}';
  v_weight numeric := 0.2;
  v_mode text;
  v_others int;
begin
  if new.reporter_id is not null then
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
  new.trust_weight := least(v_weight, 1.0);

  select mode() within group (order by r.depth_level), count(*)
    into v_mode, v_others
    from public.water_level_reports r
   where r.zone_id = new.zone_id
     and r.reported_at >= now() - interval '1 hour'
     and r.reporter_id is distinct from new.reporter_id
     and not r.is_outlier;
  new.is_outlier := v_others >= 2
    and abs((v_rank ->> new.depth_level)::int - (v_rank ->> v_mode)::int) >= 2;

  return new;
end $$;

revoke execute on function private.score_water_level_report() from public, anon, authenticated;

-- Named to fire after water_level_reports_honest_time (triggers run in name
-- order), so it scores the report at its final reported_at.
create trigger water_level_reports_score
  before insert on public.water_level_reports
  for each row execute function private.score_water_level_report();

-- The engine: 3 distinct located reporters as before, AND their combined
-- trust (each reporter's best report) of at least 1.0 — five brand-new
-- devices, or three with some history.
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
             and r.lat is not null and r.lng is not null
             and r.depth_level <> 'dry') < v_min_reporters;

  for v_zone in
    select distinct r.zone_id as id
      from public.water_level_reports r
     where r.reported_at >= now() - v_window
       and not r.is_outlier
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

    select count(distinct r.reporter_id), mode() within group (order by r.depth_level)
      into v_count, v_depth
      from public.water_level_reports r
     where r.zone_id = v_zone.id
       and r.reported_at >= now() - v_window
       and (v_since is null or r.reported_at > v_since)
       and not r.is_outlier
       and r.lat is not null and r.lng is not null
       and r.depth_level <> 'dry';

    select coalesce(sum(best), 0) into v_trust
      from (select max(r.trust_weight) as best
              from public.water_level_reports r
             where r.zone_id = v_zone.id
               and r.reported_at >= now() - v_window
               and (v_since is null or r.reported_at > v_since)
               and not r.is_outlier
               and r.lat is not null and r.lng is not null
               and r.depth_level <> 'dry'
             group by r.reporter_id) per_reporter;

    if v_count < v_min_reporters or v_trust < v_min_trust then
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
