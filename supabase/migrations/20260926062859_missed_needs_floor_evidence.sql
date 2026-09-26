-- Review findings (26 September) on the calibration loop.
--
-- A "missed" event lowered a raised bar whenever an official raised an alert
-- from nothing while even one located report was in, including reports the
-- engine had set aside after an official's own last decision on the alert.
-- So a routine official alert undid the steps that rejections had earned. A
-- miss now means what the loop needs it to: the reports the engine was
-- counting would have cleared the floor bar (3 reporters, trust 1.0, one
-- established), and only the raised bar kept the engine quiet.
--
-- The rule for which reports count was also written out five times, and the
-- miss check had already drifted from the engine's. It now lives in one
-- place, private.report_evidence, which the engine and the loop both use.

-- The reports that count toward an automatic advisory in a barangay: made in
-- the last 6 hours (and after p_since, when given), not outliers, from a
-- device that still counts, sent with a position, and not dry.
create or replace function private.report_evidence(p_zone_id text, p_since timestamptz)
returns table (reporters bigint, established bigint, trust numeric, depth text)
language sql stable security definer set search_path = '' as $$
  with counting as (
    select r.reporter_id, r.reporter_established, r.trust_weight, r.depth_level
      from public.water_level_reports r
     where r.zone_id = p_zone_id
       and r.reported_at >= now() - interval '6 hours'
       and (p_since is null or r.reported_at > p_since)
       and not r.is_outlier
       and r.trust_weight > 0
       and r.located
       and r.depth_level <> 'dry'
  )
  select (select count(distinct c.reporter_id) from counting c),
         (select count(distinct c.reporter_id) from counting c where c.reporter_established),
         (select coalesce(sum(p.best), 0)
            from (select max(c.trust_weight) as best from counting c group by c.reporter_id) p),
         (select mode() within group (order by c.depth_level) from counting c)
$$;
revoke execute on function private.report_evidence(text, timestamptz) from public, anon, authenticated;

-- When a person last decided this barangay's alert, before p_before. The
-- engine counts only reports made after it; its own entries are recorded as
-- "Automatic — <…>" and do not count as a decision.
create or replace function private.last_human_alert_decision(p_zone_id text, p_before timestamptz)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select max(o.occurred_at)
    from public.official_actions o
   where o.zone_id = p_zone_id
     and o.action in ('alert.set', 'alert.cleared')
     and o.actor_name not like 'Automatic%'
     and o.occurred_at < p_before
$$;
revoke execute on function private.last_human_alert_decision(text, timestamptz) from public, anon, authenticated;

-- Confirmed: an official replaced the engine's advisory with their own.
-- Missed: an official raised an alert from nothing over reports the engine
-- was counting that the floor bar would have acted on, so only the raised bar
-- kept it quiet. At the floor there is no raised bar to blame, and nothing
-- lower to go to. The decision being made now is left out of "last decision"
-- (occurred_at < issued_at), since it shares this transaction's time.
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

  if new.superseded_severity is null and private.alert_bar_step(new.zone_id) > 0 then
    select * into v_evidence
      from private.report_evidence(new.zone_id, private.last_human_alert_decision(new.zone_id, new.issued_at));
    if v_evidence.reporters >= 3 and v_evidence.trust >= 1.0 and v_evidence.established > 0 then
      perform private.calibrate(new.zone_id, 'missed', new.id);
    end if;
  end if;
  return null;
end $$;

-- The engine, counting through private.report_evidence. Unchanged in what it
-- decides.
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
    if exists (select 1 from public.alerts al where al.zone_id = v_zone.id and al.is_active) then
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
