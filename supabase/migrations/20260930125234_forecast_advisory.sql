-- The rain heads-up (docs/superpowers/specs/2026-09-29-rain-heads-up-design.md).
-- An hourly run (/api/rain-forecast) asks Open-Meteo about the next 6 hours
-- for the barangays of towns with an appointed official, and calls this per
-- barangay. A Forecast advisory is always an Advisory (yellow, source
-- 'predicted'), raised only where no alert is active, and never again within
-- 6 hours of the last one ending. It ends when the rain is no longer
-- forecast, or 3 hours after its heaviest hour; ending it tells no one.
--
-- predicted_timing keeps the phone's words ({en, fil}) and, beside them,
-- starts_at, peak_at and peak_mm. While heavy rain is still forecast, a later
-- heaviest hour moves peak_at on, so a long storm is not dropped mid-way.
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
    if p_peak_at > (v_active.predicted_timing->>'peak_at')::timestamptz then
      update public.alerts
         set predicted_timing = predicted_timing || jsonb_build_object('peak_at', p_peak_at, 'peak_mm', p_peak_mm)
       where id = v_active.id;
    end if;
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

-- Calibration: an official's alert over a Forecast advisory counts as raised
-- from nothing, so a forecast never hides a miss. Otherwise as 20260926062859.
create or replace function private.confirm_superseded_advisory()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_evidence record;
begin
  for v_id in
    update public.alerts
       set verdict = 'confirmed'
     where zone_id = new.zone_id
       and source = 'auto_crowdsourced'
       and superseded_at = new.issued_at
       and verdict is null
    returning id
  loop
    perform private.calibrate(new.zone_id, 'confirmed', v_id);
  end loop;

  -- A Forecast advisory is not a decision about reports, so an alert over one
  -- is judged as raised from nothing.
  if (new.superseded_severity is null
      or exists (select 1 from public.alerts p
                  where p.zone_id = new.zone_id and p.source = 'predicted' and p.superseded_at = new.issued_at))
     and private.alert_bar_step(new.zone_id) > 0 then
    select * into v_evidence
      from private.report_evidence(new.zone_id, private.last_human_alert_decision(new.zone_id, new.issued_at));
    if v_evidence.reporters >= 3 and v_evidence.trust >= 1.0 and v_evidence.established > 0 then
      perform private.calibrate(new.zone_id, 'missed', new.id);
    end if;
  end if;
  return null;
end $$;

-- The engine: a Forecast advisory no longer holds it back. Otherwise as 20260926062859.
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
