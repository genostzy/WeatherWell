-- The plan C review (1 October) on the rain heads-up.
--
-- 1. A kept Forecast advisory shows the latest run's words and times, not
--    the first run's: a storm forecast to come sooner and heavier says so.
-- 2. The engine ends a Forecast advisory 3 hours after its heaviest hour,
--    so one cannot stay up all night when the hourly runs stop (Open-Meteo,
--    GitHub or the Vault token failing).
-- Otherwise as 20260930125234_forecast_advisory.
create or replace function public.set_forecast_advisory(
  p_zone_id   text,
  p_starts_at timestamptz,
  p_peak_at   timestamptz,
  p_peak_mm   numeric,
  p_message   jsonb,
  p_timing    jsonb
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active record;
begin
  select a.id, a.source, a.predicted_timing into v_active
    from public.alerts a where a.zone_id = p_zone_id and a.is_active;

  if v_active.id is not null then
    if v_active.source <> 'predicted' then
      return 'skipped';
    end if;
    if p_starts_at is null
       or now() > greatest((v_active.predicted_timing->>'peak_at')::timestamptz, p_peak_at) + interval '3 hours' then
      update public.alerts
         set is_active = false, superseded_at = now(), expired_automatically = true
       where id = v_active.id;
      return 'ended';
    end if;
    -- Kept, it says what the latest run forecasts (residents are not told again);
    -- the heaviest hour only moves later, so a long storm is not ended mid-way.
    update public.alerts
       set message = p_message,
           predicted_timing = p_timing || jsonb_build_object(
             'starts_at', p_starts_at,
             'peak_at', greatest((v_active.predicted_timing->>'peak_at')::timestamptz, p_peak_at),
             'peak_mm', p_peak_mm)
     where id = v_active.id;
    return 'kept';
  end if;

  if p_starts_at is null
     or exists (select 1 from public.alerts a
                 where a.zone_id = p_zone_id and a.source = 'predicted'
                   and a.superseded_at > now() - interval '6 hours') then
    return 'skipped';
  end if;

  perform public.set_zone_alert(p_zone_id, 'yellow', p_message, 'predicted');
  update public.alerts
     set predicted_timing = p_timing
       || jsonb_build_object('starts_at', p_starts_at, 'peak_at', p_peak_at, 'peak_mm', p_peak_mm)
   where zone_id = p_zone_id and is_active;
  return 'raised';
end $$;
revoke execute on function public.set_forecast_advisory(text, timestamptz, timestamptz, numeric, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_forecast_advisory(text, timestamptz, timestamptz, numeric, jsonb, jsonb)
  to service_role;

create or replace function public.check_and_trigger_alerts()
 returns table(zone_id text, severity text, report_count bigint, triggered boolean)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_window constant interval := interval '6 hours';
  v_step int;
  v_min_reporters int;
  v_min_trust numeric;
  v_expired record;
  v_zone record;
  v_evidence record;
  v_depth_en text;
  v_depth_fil text;
begin
  -- Withdraw this engine's own alerts whose evidence has aged out below their
  -- barangay's bar, with the outcome on the calibration record.
  for v_expired in
    update public.alerts al
       set is_active = false, superseded_at = now(), expired_automatically = true
     where al.is_active
       and al.source = 'auto_crowdsourced'
       and (select e.reporters from private.report_evidence(al.zone_id, null) e)
           < least(3 + private.alert_bar_step(al.zone_id), 5)
    returning al.id, al.zone_id
  loop
    perform private.calibrate(v_expired.zone_id, 'expired', v_expired.id);
  end loop;

  -- A Forecast advisory ends 3 hours after its heaviest hour even when the
  -- hourly forecast runs have stopped (set_forecast_advisory ends it sooner).
  update public.alerts al
     set is_active = false, superseded_at = now(), expired_automatically = true
   where al.is_active
     and al.source = 'predicted'
     and now() > (al.predicted_timing->>'peak_at')::timestamptz + interval '3 hours';

  -- The barangays with any counting report; private.report_evidence decides.
  for v_zone in
    select distinct r.zone_id as id
      from public.water_level_reports r
     where r.reported_at >= now() - v_window
       and not r.is_outlier
       and r.trust_weight > 0
       and r.located
       and r.depth_level <> 'dry'
  loop
    -- A Forecast advisory gives way to what residents report.
    if exists (select 1 from public.alerts al
                where al.zone_id = v_zone.id and al.is_active and al.source <> 'predicted') then
      zone_id := v_zone.id; severity := null; report_count := 0; triggered := false;
      return next;
      continue;
    end if;

    v_step := private.alert_bar_step(v_zone.id);
    v_min_reporters := least(3 + v_step, 5);
    v_min_trust := 1.0 + 0.25 * v_step;

    select * into v_evidence
      from private.report_evidence(v_zone.id, private.last_human_alert_decision(v_zone.id, 'infinity'));

    if v_evidence.reporters < v_min_reporters or v_evidence.trust < v_min_trust or v_evidence.established = 0 then
      zone_id := v_zone.id; severity := null; report_count := v_evidence.reporters; triggered := false;
      return next;
      continue;
    end if;

    v_depth_en := case v_evidence.depth
      when 'ankle' then 'ankle-deep' when 'knee' then 'knee-deep'
      when 'waist' then 'waist-deep' when 'neck' then 'neck-deep' end;
    v_depth_fil := case v_evidence.depth
      when 'ankle' then 'hanggang bukong-bukong' when 'knee' then 'hanggang tuhod'
      when 'waist' then 'hanggang baywang' when 'neck' then 'hanggang leeg' end;

    perform public.set_zone_alert(
      v_zone.id,
      'yellow',
      jsonb_build_object(
        'en', format('Advisory — %s residents report %s water (unverified).', v_evidence.reporters, v_depth_en),
        'fil', format('Paalala — %s residente ang nag-ulat ng tubig na %s (hindi pa kumpirmado).', v_evidence.reporters, v_depth_fil)
      ),
      'auto_crowdsourced'
    );

    zone_id := v_zone.id; severity := 'yellow'; report_count := v_evidence.reporters; triggered := true;
    return next;
  end loop;
end;
$function$;
