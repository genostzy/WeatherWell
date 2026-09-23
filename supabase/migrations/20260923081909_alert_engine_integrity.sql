-- Sub-project 1 (spec 2026-09-23-stop-the-bleeding-design.md, section 2 and
-- correction 1). Automatic crowd-report alerts:
--   * count only reports carrying a location (the geofence trigger has
--     already checked it) and only non-"dry" reports;
--   * count only reports made strictly after the last human decision for the
--     barangay (an official, or the owner in the SQL editor);
--   * never touch a barangay with ANY active alert. Yellow is the lowest
--     severity, so an active alert is always equal or higher: skipping it
--     is what "never override an official, never downgrade, never re-issue"
--     all reduce to;
--   * are always yellow and say they are unverified.
create or replace function public.check_and_trigger_alerts()
returns table (zone_id text, severity text, report_count bigint, triggered boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min_reporters constant int := 3;
  v_window constant interval := interval '6 hours';
  v_zone record;
  v_since timestamptz;
  v_count bigint;
  v_depth text;
  v_depth_en text;
  v_depth_fil text;
begin
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

    -- The engine's own entries are recorded as "Automatic — <source>" by
    -- private.record_alert_set; every other alert.set/alert.cleared is a
    -- human decision.
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

    if v_count < v_min_reporters then
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
$$;
