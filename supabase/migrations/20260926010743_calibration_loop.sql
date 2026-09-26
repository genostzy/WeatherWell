-- Stage 4 Task 3: the calibration loop (PRD, "Calibration loop" and
-- "Confidence tagging").
--
-- Each barangay has a bar an automatic advisory must clear. Step 0 is the bar
-- the engine always used, 3 located reporters with a combined trust of 1.0.
-- It is the anti-abuse minimum, and the loop never goes below it (owner's
-- decision, 25 September). Each step up adds a reporter, to at most 5, and
-- 0.25 trust, to 2.0 at step 4.
--
-- What moves it, recorded per barangay in calibration_events:
--   * rejected: an official rejects an automatic advisory. Once the
--     rejections since the bar last moved, within 90 days, are 2 or more and
--     outnumber the confirmations, the bar goes up a step.
--   * missed: an official raises an alert from nothing while located reports
--     are already coming in, where the engine had stayed quiet. The bar comes
--     back down a step, never below step 0.
-- Confirmations, and advisories that expire without a verdict, are recorded
-- too. Together they are the record of each prediction against what happened.
-- Every change of bar also goes in the action record as engine.tuned.
--
-- Confidence: an automatic advisory is estimated until its barangay's
-- advisories have been confirmed 3 times (validated), and calibrated once 10
-- have been settled and the bar has moved. An official's alert stays validated.

-- 1. The bar.
create table public.zone_alert_floors (
  zone_id text primary key references public.zones (id) on delete cascade,
  step int not null default 0 check (step between 0 and 4),
  updated_at timestamptz not null default now()
);
alter table public.zone_alert_floors enable row level security;
-- Public, like the reports it counts: residents are told how many more
-- reports an advisory needs. Only the loop below writes it.
create policy zone_alert_floors_read on public.zone_alert_floors
  for select to anon, authenticated using (true);
revoke all on public.zone_alert_floors from anon, authenticated;
grant select on public.zone_alert_floors to anon, authenticated;

create or replace function private.alert_bar_step(p_zone_id text)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select f.step from public.zone_alert_floors f where f.zone_id = p_zone_id), 0)
$$;
revoke execute on function private.alert_bar_step(text) from public, anon, authenticated;

-- 2. The record.
create table public.calibration_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  zone_id text not null references public.zones (id) on delete cascade,
  alert_id uuid references public.alerts (id) on delete set null,
  kind text not null check (kind in ('confirmed', 'rejected', 'expired', 'missed')),
  step_before int not null,
  step_after int not null
);
create index calibration_events_zone_time on public.calibration_events (zone_id, occurred_at desc);
alter table public.calibration_events enable row level security;
-- Officials read it, as they read the action record.
create policy calibration_events_read on public.calibration_events
  for select to authenticated using ((select private.is_operator()));
revoke all on public.calibration_events from anon, authenticated;
grant select on public.calibration_events to authenticated;

alter table public.official_actions drop constraint official_actions_action_check;
alter table public.official_actions add constraint official_actions_action_check check (action = any (array[
  'alert.set', 'alert.cleared', 'centre.status', 'centre.occupancy', 'centre.confirmed',
  'pin.removed', 'pin.restored', 'official.appointed', 'official.removed', 'official.password_reset',
  'engine.tuned']));

-- 3. The loop: records one outcome, and moves the bar when it should.
create or replace function private.calibrate(p_zone_id text, p_kind text, p_alert_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_step int;
  v_new int;
  v_since timestamptz;
  v_rejected int;
  v_confirmed int;
begin
  -- Two verdicts at once must not both read the old step.
  perform pg_advisory_xact_lock(hashtext('calibrate:' || p_zone_id));
  v_step := private.alert_bar_step(p_zone_id);
  v_new := v_step;

  if p_kind = 'rejected' then
    -- The evidence since the bar last moved, so each step needs fresh evidence.
    select max(e.occurred_at) into v_since
      from public.calibration_events e
     where e.zone_id = p_zone_id and e.step_after <> e.step_before;
    select count(*) filter (where e.kind = 'rejected'), count(*) filter (where e.kind = 'confirmed')
      into v_rejected, v_confirmed
      from public.calibration_events e
     where e.zone_id = p_zone_id
       and e.occurred_at > greatest(coalesce(v_since, '-infinity'::timestamptz), now() - interval '90 days');
    v_rejected := v_rejected + 1;  -- this one
    if v_rejected >= 2 and v_rejected > v_confirmed then
      v_new := least(v_step + 1, 4);
    end if;
  elsif p_kind = 'missed' then
    v_new := greatest(v_step - 1, 0);
  end if;

  insert into public.calibration_events (zone_id, alert_id, kind, step_before, step_after)
  values (p_zone_id, p_alert_id, p_kind, v_step, v_new);

  if v_new <> v_step then
    insert into public.zone_alert_floors (zone_id, step, updated_at)
    values (p_zone_id, v_new, now())
    on conflict (zone_id) do update set step = excluded.step, updated_at = excluded.updated_at;
    perform private.record_official_action('engine.tuned', p_zone_id, null,
      jsonb_build_object('from', v_step, 'to', v_new, 'reason', p_kind,
                         'reporters', least(3 + v_new, 5), 'trust', 1.0 + 0.25 * v_new),
      'Automatic — calibration');
  end if;
end $$;
revoke execute on function private.calibrate(text, text, uuid) from public, anon, authenticated;

-- 4a. Rejected: an official says the engine's advisory is wrong.
create or replace function public.reject_automatic_alert(p_zone_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_found boolean := false;
begin
  if not private.manages_zone(p_zone_id) then
    raise exception using errcode = '42501', message = 'not an official for this barangay';
  end if;

  for v_id in
    update public.alerts
       set is_active = false, superseded_at = now(), verdict = 'rejected'
     where zone_id = p_zone_id and is_active and source = 'auto_crowdsourced'
    returning id
  loop
    v_found := true;
    perform private.calibrate(p_zone_id, 'rejected', v_id);
  end loop;

  if not v_found then
    raise exception using errcode = 'P0002', message = 'There is no automatic advisory here to reject.';
  end if;
end $$;

-- 4b. Confirmed: an official replaced the engine's advisory with their own.
-- Missed: an official raised an alert from nothing while located reports were
-- coming in, so the engine's bar kept it quiet. An alert with no reports
-- behind it is no miss: there was nothing to catch.
create or replace function private.confirm_superseded_advisory()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
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

  if new.superseded_severity is null and exists (
    select 1 from public.water_level_reports r
     where r.zone_id = new.zone_id
       and r.reported_at >= now() - interval '6 hours'
       and not r.is_outlier
       and r.trust_weight > 0
       and r.lat is not null and r.lng is not null
       and r.depth_level <> 'dry') then
    perform private.calibrate(new.zone_id, 'missed', new.id);
  end if;
  return null;
end $$;

-- 4c. Confidence, set on every automatic advisory from its barangay's record.
create or replace function private.set_engine_confidence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_confirmed int;
  v_settled int;
  v_tuned boolean;
begin
  select count(*) filter (where e.kind = 'confirmed'),
         count(*) filter (where e.kind in ('confirmed', 'rejected', 'missed')),
         coalesce(bool_or(e.step_after <> e.step_before), false)
    into v_confirmed, v_settled, v_tuned
    from public.calibration_events e
   where e.zone_id = new.zone_id;
  new.confidence := case
    when v_settled >= 10 and v_tuned then 'calibrated'
    when v_confirmed >= 3 then 'validated'
    else 'estimated' end;
  return new;
end $$;
revoke execute on function private.set_engine_confidence() from public, anon, authenticated;

create trigger alerts_engine_confidence
  before insert on public.alerts
  for each row when (new.source <> 'manual')
  execute function private.set_engine_confidence();

-- 5. The engine: each barangay's own bar, and an expiry on the record.
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
  v_since timestamptz;
  v_count bigint;
  v_established bigint;
  v_trust numeric;
  v_depth text;
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
       and (select count(distinct r.reporter_id)
              from public.water_level_reports r
             where r.zone_id = al.zone_id
               and r.reported_at >= now() - v_window
               and not r.is_outlier
               and r.trust_weight > 0
               and r.lat is not null and r.lng is not null
               and r.depth_level <> 'dry') < least(3 + private.alert_bar_step(al.zone_id), 5)
    returning al.id, al.zone_id
  loop
    perform private.calibrate(v_expired.zone_id, 'expired', v_expired.id);
  end loop;

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

    v_step := private.alert_bar_step(v_zone.id);
    v_min_reporters := least(3 + v_step, 5);
    v_min_trust := 1.0 + 0.25 * v_step;

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
