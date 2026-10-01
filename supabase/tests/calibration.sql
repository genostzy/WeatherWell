-- Calibration loop (Stage 4 Task 3; PRD "Calibration loop" and "Confidence
-- tagging"). Each barangay's bar for an automatic advisory moves with what
-- officials make of its advisories, and never below the anti-abuse minimum of
-- 3 located reporters with a combined trust of 1.0. All of it is rolled back.
begin;

-- alerts_record_cleared is deferred to commit; this suite never commits.
set constraints all immediate;

create schema if not exists tests;

-- Runs one call as the official who manages every cal-* barangay.
create or replace function tests.as_calibrator(stmt text) returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"ca200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    execute stmt;
  exception when others then
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    raise;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- A located report at the barangay's centre, filed as p_uid through the
-- authenticated role.
create or replace function tests.calibration_report(p_uid uuid, p_zone text) returns void
language plpgsql set search_path = '' as $$
declare
  v_lat double precision;
  v_lng double precision;
begin
  select z.lat, z.lng into v_lat, v_lng from public.zones z where z.id = p_zone;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng)
    values (p_zone, 'waist', p_uid, v_lat, v_lng);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- A located report made p_hours_ago hours ago (the write-time check keeps
-- any time within the last 6 hours), filed as p_uid.
create or replace function tests.calibration_report_at(p_uid uuid, p_zone text, p_hours_ago int) returns void
language plpgsql set search_path = '' as $$
declare
  v_lat double precision;
  v_lng double precision;
begin
  select z.lat, z.lng into v_lat, v_lng from public.zones z where z.id = p_zone;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng, reported_at)
    values (p_zone, 'waist', p_uid, v_lat, v_lng, now() - make_interval(hours => p_hours_ago));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- An automatic advisory, raised the way the engine raises one.
create or replace function tests.calibration_advisory(p_zone text) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.set_zone_alert(p_zone, 'yellow', '{"en":"a","fil":"a"}'::jsonb, 'auto_crowdsourced');
  select id into v_id from public.alerts where zone_id = p_zone and is_active;
  return v_id;
end $$;

-- Fixtures: ten barangays in one town, its official, 30 identities made
-- two days ago (so they count as established) and one resident.
do $$
begin
  insert into public.zones
    (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
    select 'cal-z' || g, '9900008' || lpad(g::text, 3, '0'), 'Calibration Zone ' || g,
           '{"en":"x","fil":"x"}'::jsonb, 14 + g * 0.2, 122, '[]'::jsonb, '000'
      from generate_series(1, 10) g;
  insert into auth.users (id, created_at)
    select ('ca100000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, now() - interval '2 days'
      from generate_series(1, 30) g
    union all
    select 'ca200000-0000-4000-8000-000000000001'::uuid, now() - interval '2 days'
    union all
    select 'ca300000-0000-4000-8000-000000000001'::uuid, now() - interval '2 days';
  insert into public.profiles (id, role, area_code, display_name)
    values ('ca200000-0000-4000-8000-000000000001', 'operator', '9900008', 'Test Calibrator')
    on conflict (id) do update
      set role = excluded.role, area_code = excluded.area_code, display_name = excluded.display_name;
end $$;

-- C1: two rejected advisories raise a barangay's bar one step, and the
-- action record says so.
do $$
declare
  v_detail jsonb;
begin
  perform tests.calibration_advisory('cal-z1');
  perform tests.as_calibrator($q$select public.reject_automatic_alert('cal-z1')$q$);
  if private.alert_bar_step('cal-z1') <> 0 then
    raise exception using errcode = 'TSTFL', message = 'C1: one rejection moved the bar';
  end if;

  perform tests.calibration_advisory('cal-z1');
  perform tests.as_calibrator($q$select public.reject_automatic_alert('cal-z1')$q$);
  if private.alert_bar_step('cal-z1') <> 1 then
    raise exception using errcode = 'TSTFL', message = format('C1: two rejections left the bar at step %s', private.alert_bar_step('cal-z1'));
  end if;

  select detail into v_detail from public.official_actions
   where zone_id = 'cal-z1' and action = 'engine.tuned' and actor_name = 'Automatic — calibration';
  if v_detail is null or (v_detail ->> 'reporters')::int <> 4 or (v_detail ->> 'trust')::numeric <> 1.25
     or v_detail ->> 'reason' <> 'rejected' then
    raise exception using errcode = 'TSTFL', message = format('C1: the action record holds %s', v_detail);
  end if;
  raise notice 'ok C1: two rejections raise a barangay''s bar one step, in the action record';
end $$;

-- C2: after the bar moves it takes fresh evidence to move again, and it
-- stops at step 4 (5 reporters, trust 2.0).
do $$
begin
  perform tests.calibration_advisory('cal-z1');
  perform tests.as_calibrator($q$select public.reject_automatic_alert('cal-z1')$q$);
  if private.alert_bar_step('cal-z1') <> 1 then
    raise exception using errcode = 'TSTFL', message = 'C2: a rejection counted twice, before and after the bar moved';
  end if;
  for i in 1..7 loop
    perform tests.calibration_advisory('cal-z1');
    perform tests.as_calibrator($q$select public.reject_automatic_alert('cal-z1')$q$);
  end loop;
  if private.alert_bar_step('cal-z1') <> 4 then
    raise exception using errcode = 'TSTFL', message = format('C2: ten rejections left the bar at step %s, not the ceiling', private.alert_bar_step('cal-z1'));
  end if;
  raise notice 'ok C2: each step needs fresh evidence, and the bar stops at 5 reporters / 2.0 trust';
end $$;

-- C3: rejections that do not outnumber confirmations leave the bar alone.
do $$
begin
  for i in 1..2 loop
    perform tests.calibration_advisory('cal-z2');
    perform tests.as_calibrator($q$select public.set_zone_alert('cal-z2', 'orange', '{"en":"o","fil":"o"}'::jsonb)$q$);
    perform tests.as_calibrator($q$select public.set_zone_alert('cal-z2', null, null)$q$);
  end loop;
  for i in 1..2 loop
    perform tests.calibration_advisory('cal-z2');
    perform tests.as_calibrator($q$select public.reject_automatic_alert('cal-z2')$q$);
  end loop;
  if private.alert_bar_step('cal-z2') <> 0 then
    raise exception using errcode = 'TSTFL', message = 'C3: two rejections against two confirmations moved the bar';
  end if;
  perform tests.calibration_advisory('cal-z2');
  perform tests.as_calibrator($q$select public.reject_automatic_alert('cal-z2')$q$);
  if private.alert_bar_step('cal-z2') <> 1 then
    raise exception using errcode = 'TSTFL', message = 'C3: three rejections against two confirmations left the bar';
  end if;
  raise notice 'ok C3: the bar moves only when rejections outnumber confirmations';
end $$;

-- C4: the engine holds each barangay to its own bar. At step 1, six reporters
-- (trust 1.2) raise nothing and a seventh (1.4) does; at step 0 five do.
do $$
declare
  u text := 'ca100000-0000-4000-8000-0000000000';
begin
  insert into public.zone_alert_floors (zone_id, step) values ('cal-z4', 1);
  for g in 1..6 loop
    perform tests.calibration_report((u || lpad(g::text, 2, '0'))::uuid, 'cal-z4');
  end loop;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = 'cal-z4' and is_active) then
    raise exception using errcode = 'TSTFL', message = 'C4: six reporters cleared a step-1 bar';
  end if;
  perform tests.calibration_report((u || '07')::uuid, 'cal-z4');
  perform * from public.check_and_trigger_alerts();
  if not exists (select 1 from public.alerts where zone_id = 'cal-z4' and is_active and source = 'auto_crowdsourced') then
    raise exception using errcode = 'TSTFL', message = 'C4: seven reporters did not clear a step-1 bar';
  end if;

  for g in 11..15 loop
    perform tests.calibration_report((u || lpad(g::text, 2, '0'))::uuid, 'cal-z5');
  end loop;
  perform * from public.check_and_trigger_alerts();
  if not exists (select 1 from public.alerts where zone_id = 'cal-z5' and is_active and source = 'auto_crowdsourced') then
    raise exception using errcode = 'TSTFL', message = 'C4: the step-0 bar changed';
  end if;
  raise notice 'ok C4: the engine holds each barangay to its own bar';
end $$;

-- C5: a missed event brings the bar down a step. A miss is an official's
-- alert raised from nothing over reports the engine was counting that would
-- have cleared the floor bar (3 reporters, trust 1.0, one established), so
-- only the raised bar kept the engine quiet. Too few reports, reports made
-- before the official's own last decision on the alert, or a bar already at
-- the floor: no miss.
do $$
declare
  u text := 'ca100000-0000-4000-8000-0000000000';
begin
  -- Two reporters: not even the floor bar would have caught this.
  insert into public.zone_alert_floors (zone_id, step) values ('cal-z6', 1);
  perform tests.calibration_report((u || '21')::uuid, 'cal-z6');
  perform tests.calibration_report((u || '22')::uuid, 'cal-z6');
  perform * from public.check_and_trigger_alerts();
  perform tests.as_calibrator($q$select public.set_zone_alert('cal-z6', 'orange', '{"en":"o","fil":"o"}'::jsonb)$q$);
  if private.alert_bar_step('cal-z6') <> 1
     or exists (select 1 from public.calibration_events where zone_id = 'cal-z6' and kind = 'missed') then
    raise exception using errcode = 'TSTFL', message = 'C5: two reporters, whom no bar would have acted on, counted as a miss';
  end if;

  -- Five reporters (trust 1.0) clear the floor but not the step-1 bar (1.25): a miss.
  insert into public.zone_alert_floors (zone_id, step) values ('cal-z9', 1);
  for g in 23..27 loop
    perform tests.calibration_report((u || lpad(g::text, 2, '0'))::uuid, 'cal-z9');
  end loop;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = 'cal-z9' and is_active) then
    raise exception using errcode = 'TSTFL', message = 'C5: five reporters cleared a step-1 bar';
  end if;
  perform tests.as_calibrator($q$select public.set_zone_alert('cal-z9', 'orange', '{"en":"o","fil":"o"}'::jsonb)$q$);
  if private.alert_bar_step('cal-z9') <> 0 then
    raise exception using errcode = 'TSTFL', message = 'C5: a missed event did not lower the bar';
  end if;

  -- At the floor there is nothing lower, and nothing a raised bar kept quiet.
  perform tests.as_calibrator($q$select public.set_zone_alert('cal-z9', null, null)$q$);
  perform tests.as_calibrator($q$select public.set_zone_alert('cal-z9', 'orange', '{"en":"o","fil":"o"}'::jsonb)$q$);
  if private.alert_bar_step('cal-z9') <> 0
     or (select count(*) from public.calibration_events where zone_id = 'cal-z9' and kind = 'missed') <> 1 then
    raise exception using errcode = 'TSTFL', message = 'C5: the floor bar moved, or recorded a miss';
  end if;

  -- Reports made before the official's own last decision on the alert are the
  -- ones the engine sets aside, so they are no miss either. That decision is
  -- written an hour back here, since everything in this suite shares now().
  insert into public.zone_alert_floors (zone_id, step) values ('cal-z10', 1);
  for g in 23..27 loop
    perform tests.calibration_report_at((u || lpad(g::text, 2, '0'))::uuid, 'cal-z10', 2);
  end loop;
  insert into public.official_actions (actor_id, actor_name, action, zone_id, target_id, detail, occurred_at)
    values ('ca200000-0000-4000-8000-000000000001', 'Test Calibrator', 'alert.cleared', 'cal-z10', null,
            '{"from":"orange"}'::jsonb, now() - interval '1 hour');
  perform tests.as_calibrator($q$select public.set_zone_alert('cal-z10', 'orange', '{"en":"o","fil":"o"}'::jsonb)$q$);
  if private.alert_bar_step('cal-z10') <> 1 then
    raise exception using errcode = 'TSTFL', message = 'C5: reports the engine had set aside counted as a miss';
  end if;

  -- An official alert raised with no reports at all is no miss: nothing was there to catch.
  perform tests.as_calibrator($q$select public.set_zone_alert('cal-z3', 'orange', '{"en":"o","fil":"o"}'::jsonb)$q$);
  if exists (select 1 from public.calibration_events where zone_id = 'cal-z3') then
    raise exception using errcode = 'TSTFL', message = 'C5: an alert with no reports behind it counted as missed';
  end if;
  raise notice 'ok C5: a miss is only what the raised bar kept quiet, and it lowers the bar a step';
end $$;

-- C6: every advisory's outcome is recorded against it: confirmed, rejected,
-- or expired without a verdict. That record is the prediction against what
-- happened.
do $$
declare
  v_advisory uuid;
begin
  if (select count(*) from public.calibration_events where zone_id = 'cal-z2' and kind = 'confirmed' and alert_id is not null) <> 2
     or (select count(*) from public.calibration_events where zone_id = 'cal-z2' and kind = 'rejected' and alert_id is not null) <> 3 then
    raise exception using errcode = 'TSTFL', message = 'C6: confirmations and rejections are not all on record';
  end if;
  v_advisory := tests.calibration_advisory('cal-z7');
  perform * from public.check_and_trigger_alerts();  -- nothing behind it, so it expires
  if not exists (select 1 from public.calibration_events where zone_id = 'cal-z7' and kind = 'expired' and alert_id = v_advisory) then
    raise exception using errcode = 'TSTFL', message = 'C6: an advisory expired without an outcome on record';
  end if;
  raise notice 'ok C6: every advisory''s outcome is recorded against it';
end $$;

-- C7: confidence. An automatic advisory is estimated until its barangay's
-- advisories have been confirmed 3 times, and calibrated once 10 have been
-- settled and the bar has moved. An official's alert stays validated.
do $$
begin
  if (select confidence from public.alerts where id = (select alert_id from public.calibration_events where zone_id = 'cal-z7' and kind = 'expired')) <> 'estimated' then
    raise exception using errcode = 'TSTFL', message = 'C7: an advisory with no track record was not estimated';
  end if;

  perform tests.calibration_advisory('cal-z2');
  perform tests.as_calibrator($q$select public.set_zone_alert('cal-z2', 'orange', '{"en":"o","fil":"o"}'::jsonb)$q$);
  if (select confidence from public.alerts where zone_id = 'cal-z2' and is_active) <> 'validated' then
    raise exception using errcode = 'TSTFL', message = 'C7: an official''s alert was not validated';
  end if;
  perform tests.as_calibrator($q$select public.set_zone_alert('cal-z2', null, null)$q$);
  if (select confidence from public.alerts where id = tests.calibration_advisory('cal-z2')) <> 'validated' then
    raise exception using errcode = 'TSTFL', message = 'C7: three confirmations did not validate the next advisory';
  end if;
  perform tests.as_calibrator($q$select public.set_zone_alert('cal-z2', null, null)$q$);

  if (select confidence from public.alerts where id = tests.calibration_advisory('cal-z1')) <> 'calibrated' then
    raise exception using errcode = 'TSTFL', message = 'C7: ten settled advisories and a moved bar did not calibrate the next one';
  end if;
  raise notice 'ok C7: estimated, validated and calibrated follow the barangay''s record';
end $$;

-- C8: anyone may read the bar; only officials read the record; nobody writes
-- either except the loop.
do $$
declare
  n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into n from public.zone_alert_floors where zone_id = 'cal-z1';
  execute 'reset role';
  if n <> 1 then
    raise exception using errcode = 'TSTFL', message = 'C8: the public cannot read the bar';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"ca300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  execute 'set local role authenticated';
  select count(*) into n from public.calibration_events;
  execute 'reset role';
  if n <> 0 then
    raise exception using errcode = 'TSTFL', message = 'C8: a resident can read the calibration record';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"ca200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  execute 'set local role authenticated';
  select count(*) into n from public.calibration_events where zone_id like 'cal-z%';
  begin
    insert into public.zone_alert_floors (zone_id, step) values ('cal-z8', 0);
    raise exception using errcode = 'TSTFL', message = 'C8: an official set a bar by hand';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.calibration_events;
    raise exception using errcode = 'TSTFL', message = 'C8: an official deleted the record';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if n = 0 then
    raise exception using errcode = 'TSTFL', message = 'C8: the official cannot read the record';
  end if;
  if has_function_privilege('authenticated', 'private.calibrate(text,text,uuid)', 'execute') then
    raise exception using errcode = 'TSTFL', message = 'C8: a client can call the loop';
  end if;
  raise notice 'ok C8: the bar is public, the record is officials'', and only the loop writes either';
end $$;

-- RH1-RH6: the rain heads-up. A Forecast advisory (source 'predicted') is
-- raised, kept and ended by the service role's set_forecast_advisory, never
-- over another alert, and not again within 6 hours of the last one ending.
-- Residents' reports replace it, and an official's alert over it counts as
-- raised from nothing for the loop.
do $$
declare
  u text := 'ca400000-0000-4000-8000-0000000000';
  msg constant jsonb := '{"en":"Forecast advisory","fil":"Paalala mula sa forecast"}';
  timing constant jsonb := '{"en":"From about 3 PM","fil":"Mula bandang 3 PM"}';
  r text;
  a record;
begin
  insert into public.zones
    (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
    select 'rh-z' || g, '9900008' || (100 + g)::text, 'Rain Zone ' || g,
           '{"en":"x","fil":"x"}'::jsonb, 13 + g * 0.2, 122, '[]'::jsonb, '000'
      from generate_series(1, 5) g;
  insert into auth.users (id, created_at)
    select (u || lpad(g::text, 2, '0'))::uuid, now() - interval '2 days' from generate_series(1, 11) g;

  -- RH1: raised in a barangay with no alert, then kept.
  set local role service_role;
  r := public.set_forecast_advisory('rh-z1', now() + interval '1 hour', now() + interval '2 hours', 22, msg, timing);
  reset role;
  select * into a from public.alerts where zone_id = 'rh-z1' and is_active;
  if r <> 'raised' or a.severity <> 'yellow' or a.source <> 'predicted' or a.message <> msg
     or a.predicted_timing->>'en' <> 'From about 3 PM' or a.predicted_timing->>'peak_at' is null then
    raise exception using errcode = 'TSTFL', message = format('RH1: %s raised %s', r, a);
  end if;
  set local role service_role;
  r := public.set_forecast_advisory('rh-z1', now() + interval '1 hour', now() + interval '2 hours', 22, msg, timing);
  reset role;
  if r <> 'kept' or (select count(*) from public.alerts where zone_id = 'rh-z1') <> 1 then
    raise exception using errcode = 'TSTFL', message = format('RH1: the second run answered %s', r);
  end if;

  -- RH2: no heavy rain ahead ends it, quietly; none again within 6 hours; a manual alert is left alone.
  set local role service_role;
  r := public.set_forecast_advisory('rh-z1', null, null, null, null, null);
  reset role;
  if r <> 'ended' or exists (select 1 from public.alerts where zone_id = 'rh-z1' and is_active)
     or not (select expired_automatically from public.alerts where zone_id = 'rh-z1') then
    raise exception using errcode = 'TSTFL', message = format('RH2: ending answered %s', r);
  end if;
  set local role service_role;
  r := public.set_forecast_advisory('rh-z1', now() + interval '1 hour', now() + interval '2 hours', 22, msg, timing);
  reset role;
  if r <> 'skipped' then
    raise exception using errcode = 'TSTFL', message = format('RH2: a new one within 6 hours answered %s', r);
  end if;
  perform tests.as_calibrator($q$select public.set_zone_alert('rh-z2', 'orange', '{"en":"o","fil":"o"}'::jsonb)$q$);
  set local role service_role;
  r := public.set_forecast_advisory('rh-z2', now() + interval '1 hour', now() + interval '2 hours', 22, msg, timing);
  reset role;
  if r <> 'skipped' or (select severity || source from public.alerts where zone_id = 'rh-z2' and is_active) <> 'orangemanual' then
    raise exception using errcode = 'TSTFL', message = format('RH2: over a manual alert it answered %s', r);
  end if;
  set local role service_role;
  r := public.set_forecast_advisory('rh-z2', null, null, null, null, null);
  reset role;
  if r <> 'skipped' or not exists (select 1 from public.alerts where zone_id = 'rh-z2' and is_active) then
    raise exception using errcode = 'TSTFL', message = format('RH2: an end over a manual alert answered %s', r);
  end if;

  -- RH3: three hours and a minute past its heaviest hour, the next run ends it.
  set local role service_role;
  perform public.set_forecast_advisory('rh-z3', now() - interval '4 hours', now() - interval '3 hours 1 minute', 22, msg, timing);
  r := public.set_forecast_advisory('rh-z3', now() + interval '1 hour', now() - interval '3 hours 1 minute', 22, msg, timing);
  reset role;
  if r <> 'ended' or exists (select 1 from public.alerts where zone_id = 'rh-z3' and is_active) then
    raise exception using errcode = 'TSTFL', message = format('RH3: past its peak it answered %s', r);
  end if;

  -- RH4: residents' reports replace it at once.
  set local role service_role;
  perform public.set_forecast_advisory('rh-z4', now() + interval '1 hour', now() + interval '2 hours', 22, msg, timing);
  reset role;
  for g in 1..6 loop
    perform tests.calibration_report((u || lpad(g::text, 2, '0'))::uuid, 'rh-z4');
  end loop;
  perform * from public.check_and_trigger_alerts();
  if (select source from public.alerts where zone_id = 'rh-z4' and is_active) is distinct from 'auto_crowdsourced' then
    raise exception using errcode = 'TSTFL', message = 'RH4: residents'' reports did not replace the forecast advisory';
  end if;

  -- RH5: an official's alert over it, with reports the floor bar would act on, is a miss.
  insert into public.zone_alert_floors (zone_id, step) values ('rh-z5', 1);
  set local role service_role;
  perform public.set_forecast_advisory('rh-z5', now() + interval '1 hour', now() + interval '2 hours', 22, msg, timing);
  reset role;
  for g in 7..11 loop
    perform tests.calibration_report((u || lpad(g::text, 2, '0'))::uuid, 'rh-z5');
  end loop;
  perform tests.as_calibrator($q$select public.set_zone_alert('rh-z5', 'red', '{"en":"r","fil":"r"}'::jsonb)$q$);
  if not exists (select 1 from public.calibration_events where zone_id = 'rh-z5' and kind = 'missed') then
    raise exception using errcode = 'TSTFL', message = 'RH5: a Warning over a forecast advisory hid a miss';
  end if;

  -- RH6: only the service role may call it.
  if has_function_privilege('anon', 'public.set_forecast_advisory(text,timestamptz,timestamptz,numeric,jsonb,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.set_forecast_advisory(text,timestamptz,timestamptz,numeric,jsonb,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.set_forecast_advisory(text,timestamptz,timestamptz,numeric,jsonb,jsonb)', 'execute') then
    raise exception using errcode = 'TSTFL', message = 'RH6: set_forecast_advisory is callable by the wrong roles';
  end if;
  raise notice 'ok RH1-RH6: Forecast advisories are raised, kept and ended by the service role, and reports replace them';
end $$;

-- RH7-RH8 (the plan C review): a Forecast advisory ends 3 hours after its
-- heaviest hour even when the hourly runs stop (the engine ends it), and one
-- that is kept shows the latest run's words and times.
do $$
declare
  msg1 constant jsonb := '{"en":"from about 2 PM, up to 16 mm","fil":"a"}';
  msg2 constant jsonb := '{"en":"from about 11 AM, up to 40 mm","fil":"b"}';
  r text;
  a record;
begin
  insert into public.zones
    (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
    select 'rh-z' || g, '9900008' || (100 + g)::text, 'Rain Zone ' || g,
           '{"en":"x","fil":"x"}'::jsonb, 13 + g * 0.2, 122, '[]'::jsonb, '000'
      from generate_series(7, 8) g;

  -- RH7: past its peak and no run since: the engine ends it, as automatically expired.
  set local role service_role;
  perform public.set_forecast_advisory('rh-z7', now() - interval '5 hours', now() - interval '3 hours 1 minute', 22,
    msg1, '{"en":"From about 2 PM","fil":"Mula bandang 2 PM"}'::jsonb);
  reset role;
  perform * from public.check_and_trigger_alerts();
  select * into a from public.alerts where zone_id = 'rh-z7';
  if a.is_active or not a.expired_automatically then
    raise exception using errcode = 'TSTFL', message = 'RH7: a forecast advisory past its peak outlived the runs';
  end if;

  -- RH8: kept, it takes the latest run's words and times, and stays one row.
  set local role service_role;
  perform public.set_forecast_advisory('rh-z8', now() + interval '4 hours', now() + interval '5 hours', 16,
    msg1, '{"en":"From about 2 PM","fil":"Mula bandang 2 PM"}'::jsonb);
  r := public.set_forecast_advisory('rh-z8', now() + interval '1 hour', now() + interval '2 hours', 40,
    msg2, '{"en":"From about 11 AM","fil":"Mula bandang 11 AM"}'::jsonb);
  reset role;
  select * into a from public.alerts where zone_id = 'rh-z8' and is_active;
  if r <> 'kept' or a.message <> msg2 or a.predicted_timing->>'en' <> 'From about 11 AM'
     or (a.predicted_timing->>'peak_mm')::numeric <> 40
     or (select count(*) from public.alerts where zone_id = 'rh-z8') <> 1 then
    raise exception using errcode = 'TSTFL', message = format('RH8: kept as %s: %s', r, a);
  end if;
  raise notice 'ok RH7-RH8: a forecast advisory ends 3 hours past its peak without a run, and shows the latest forecast';
end $$;

rollback;
