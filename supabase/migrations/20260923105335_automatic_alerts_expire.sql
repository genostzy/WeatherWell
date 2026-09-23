-- Final-review I4 for sub-project 1. The engine never revisits a barangay
-- with an active alert, and nothing expired alerts, so a crowd-report
-- advisory (spoofed or real) stayed up forever almost everywhere. The engine
-- now withdraws its OWN auto_crowdsourced alert once fewer than 3 qualifying
-- reports remain in the 6-hour window. Officials' alerts are never touched.
--
-- The withdrawal must not look like a human decision (that would move the
-- "last human decision" time the engine counts reports from), so the alert
-- row carries the fact itself and the audit trigger labels it.
alter table public.alerts add column expired_automatically boolean not null default false;

create or replace function private.record_alert_cleared()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.alerts where zone_id = new.zone_id and is_active) then
    perform private.record_official_action(
      'alert.cleared', new.zone_id, new.id::text,
      jsonb_build_object('from', old.severity),
      case when new.expired_automatically then 'Automatic — expired' end);
  end if;
  return null;
end $$;

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
