-- Abuse-attempt suite (PRD Stage 4 exit criterion): anti-abuse layers 1-6
-- and the identity-age hardening. Each block is one thing an attacker tries,
-- made through the path they would use (the authenticated role, with RLS and
-- column grants in force), and what stops it. All of it is rolled back.
--
-- Known limits, not tested because nothing in the database can stop them:
--   * A spoofed GPS position inside the barangay passes the geofence
--     (layer 1). Layers 3-6 and an official's review bound what it can do.
--   * Identities made more than a day ahead pass the identity-age gate. One
--     rejected advisory burns them (layer 6), and an official reviews every
--     automatic advisory (layer 7).
--   * Two or more established identities agreeing on "dry" can mark a real
--     flood report as an outlier. Outliers are flagged, never deleted.
--   * New anonymous identities are limited only by Supabase Auth's per-IP
--     sign-up rate limit.
begin;

-- alerts_record_cleared is deferred to commit; this suite never commits.
set constraints all immediate;

-- Files a report as p_uid through the authenticated role, at the zone's
-- centre unless a position is given. Returns what the database scored.
create or replace function tests.report_as(
  p_uid uuid, p_zone text, p_depth text,
  p_lat double precision default null, p_lng double precision default null,
  p_at timestamptz default null,
  out trust_weight numeric, out is_outlier boolean, out reporter_established boolean)
language plpgsql set search_path = '' as $$
declare
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
begin
  if v_lat is null then
    select z.lat, z.lng into v_lat, v_lng from public.zones z where z.id = p_zone;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.water_level_reports as r (zone_id, depth_level, reporter_id, lat, lng, reported_at)
      values (p_zone, p_depth, p_uid, v_lat, v_lng, p_at)
      returning r.trust_weight, r.is_outlier, r.reporter_established
      into trust_weight, is_outlier, reporter_established;
  exception when others then
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    raise;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Runs one call as the official who manages every abuse-* barangay.
create or replace function tests.as_official(stmt text) returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"ab200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
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

-- Fixtures: sixteen barangays in one town, its official, 40 brand-new
-- identities (ab0...) and 40 made two days ago (ab1...).
do $$
begin
  insert into public.zones
    (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
    select 'abuse-z' || g, '9900009' || lpad(g::text, 3, '0'), 'Abuse Zone ' || g,
           '{"en":"x","fil":"x"}'::jsonb, 15 + g * 0.2, 121, '[]'::jsonb, '000'
      from generate_series(1, 16) g;
  insert into auth.users (id, created_at)
    select ('ab000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, now()
      from generate_series(1, 40) g
    union all
    select ('ab100000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, now() - interval '2 days'
      from generate_series(1, 40) g
    union all
    select 'ab200000-0000-4000-8000-000000000001'::uuid, now() - interval '2 days';
  insert into public.profiles (id, role, area_code, display_name)
    values ('ab200000-0000-4000-8000-000000000001', 'operator', '9900009', 'Test Kapitan')
    on conflict (id) do update
      set role = excluded.role, area_code = excluded.area_code, display_name = excluded.display_name;
end $$;

-- Layer 1, geofence. A report from far away, or with a coordinate that is not
-- a number, is refused rather than skipping the distance check.
do $$
declare
  v_id uuid := 'ab000000-0000-4000-8000-000000000030';
  v_hint text;
begin
  begin
    perform tests.report_as(v_id, 'abuse-z1', 'neck', 16.2 + 1, 121 + 1);
    raise exception using errcode = 'TSTFL', message = 'A1a: a report ~150 km from its barangay was accepted';
  exception when check_violation then
    -- The app names the refusal by this hint, never by the wording.
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint is distinct from 'too_far' then
      raise exception using errcode = 'TSTFL', message = format('A1a: the refusal''s hint is %s, not too_far', v_hint);
    end if;
  end;
  begin
    perform tests.report_as(v_id, 'abuse-z1', 'neck', 'NaN', 121);
    raise exception using errcode = 'TSTFL', message = 'A1b: a NaN latitude was accepted';
  exception when check_violation then null;
  end;
  begin
    perform tests.report_as(v_id, 'abuse-z1', 'neck', 15.2, '-Infinity');
    raise exception using errcode = 'TSTFL', message = 'A1c: an infinite longitude was accepted';
  exception when check_violation then null;
  end;
  raise notice 'ok A1: far-away and non-numeric positions are refused';
end $$;

-- Layer 2, rate limit. One device files again straight away, and then tries
-- backdating every report so none looks recent.
do $$
declare
  v_msg text;
  v_hint text;
begin
  perform tests.report_as('ab100000-0000-4000-8000-000000000008', 'abuse-z2', 'knee');
  begin
    perform tests.report_as('ab100000-0000-4000-8000-000000000008', 'abuse-z2', 'knee');
    raise exception using errcode = 'TSTFL', message = 'A2a: a repeat report inside the window was accepted';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    if v_msg !~ 'Too many reports' then raise; end if;
    -- The app names the wait by this hint, never by the wording.
    if v_hint is distinct from 'rate_limited' then
      raise exception using errcode = 'TSTFL', message = format('A2a: the refusal''s hint is %s, not rate_limited', v_hint);
    end if;
  end;

  perform tests.report_as('ab100000-0000-4000-8000-000000000009', 'abuse-z2', 'knee', p_at => now() - interval '10 minutes');
  begin
    perform tests.report_as('ab100000-0000-4000-8000-000000000009', 'abuse-z2', 'knee', p_at => now() - interval '20 minutes');
    raise exception using errcode = 'TSTFL', message = 'A2b: backdating got a repeat report past the rate limit';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'Too many reports' then raise; end if;
  end;
  raise notice 'ok A2: one device cannot repeat a report within 5 minutes, backdated or not';
end $$;

-- Layer 3, multi-report threshold. One device's reports across the hour, or
-- two devices with enough combined trust, never raise an advisory.
do $$
begin
  -- A3a: three reports from one established, checked-in device.
  insert into public.evacuation_check_ins (zone_id, user_id, status)
    values ('abuse-z3', 'ab100000-0000-4000-8000-000000000007', 'safe');
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng, reported_at, received_at)
    values ('abuse-z3', 'neck', 'ab100000-0000-4000-8000-000000000007', 15.6, 121, now() - interval '40 minutes', now() - interval '40 minutes'),
           ('abuse-z3', 'neck', 'ab100000-0000-4000-8000-000000000007', 15.6, 121, now() - interval '20 minutes', now() - interval '20 minutes');
  perform tests.report_as('ab100000-0000-4000-8000-000000000007', 'abuse-z3', 'neck');
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = 'abuse-z3' and is_active) then
    raise exception using errcode = 'TSTFL', message = 'A3a: one device raised an advisory';
  end if;

  -- A3b: two established, checked-in devices (0.5 each, 1.0 together).
  insert into public.evacuation_check_ins (zone_id, user_id, status)
    values ('abuse-z4', 'ab100000-0000-4000-8000-000000000010', 'safe'),
           ('abuse-z4', 'ab100000-0000-4000-8000-000000000011', 'safe');
  perform tests.report_as('ab100000-0000-4000-8000-000000000010', 'abuse-z4', 'neck');
  perform tests.report_as('ab100000-0000-4000-8000-000000000011', 'abuse-z4', 'neck');
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = 'abuse-z4' and is_active) then
    raise exception using errcode = 'TSTFL', message = 'A3b: two devices raised an advisory';
  end if;
  raise notice 'ok A3: fewer than three reporters never raise an advisory';
end $$;

-- Layer 4, outlier downweighting. A fake flood report against its neighbours
-- is flagged; fake "dry" reports cannot push a real flood report out.
do $$
declare
  r record;
begin
  -- A4a: a neck-deep report where two established neighbours say dry.
  perform tests.report_as('ab100000-0000-4000-8000-000000000001', 'abuse-z5', 'dry');
  perform tests.report_as('ab100000-0000-4000-8000-000000000002', 'abuse-z5', 'dry');
  r := tests.report_as('ab100000-0000-4000-8000-000000000003', 'abuse-z5', 'neck');
  if not r.is_outlier then
    raise exception using errcode = 'TSTFL', message = 'A4a: a report contradicting its neighbours was not flagged';
  end if;

  -- A4b: three brand-new identities say dry to hide a real waist-deep report.
  perform tests.report_as('ab000000-0000-4000-8000-000000000001', 'abuse-z6', 'dry');
  perform tests.report_as('ab000000-0000-4000-8000-000000000002', 'abuse-z6', 'dry');
  perform tests.report_as('ab000000-0000-4000-8000-000000000003', 'abuse-z6', 'dry');
  r := tests.report_as('ab100000-0000-4000-8000-000000000004', 'abuse-z6', 'waist');
  if r.is_outlier then
    raise exception using errcode = 'TSTFL', message = 'A4b: new identities made a real report an outlier';
  end if;

  -- A4c: one established device says dry three times across the hour.
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng, reported_at, received_at)
    values ('abuse-z7', 'dry', 'ab100000-0000-4000-8000-000000000005', 16.4, 121, now() - interval '40 minutes', now() - interval '40 minutes'),
           ('abuse-z7', 'dry', 'ab100000-0000-4000-8000-000000000005', 16.4, 121, now() - interval '20 minutes', now() - interval '20 minutes');
  perform tests.report_as('ab100000-0000-4000-8000-000000000005', 'abuse-z7', 'dry');
  r := tests.report_as('ab100000-0000-4000-8000-000000000006', 'abuse-z7', 'waist');
  if r.is_outlier then
    raise exception using errcode = 'TSTFL', message = 'A4c: one device''s repeats made a real report an outlier';
  end if;
  raise notice 'ok A4: contradicting reports are flagged; fake dry reports cannot hide a flood';
end $$;

-- Layer 5, anonymous identity. A signed-in attacker files as someone else,
-- scores their own report, or reads other reporters' positions; a visitor
-- who never signed in files at all.
select tests.as_user('ab000000-0000-4000-8000-000000000031');
select tests.expect_denied('A5a: file a report as another identity',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id)
    values ('abuse-z8', 'neck', 'ab100000-0000-4000-8000-000000000001')$$);
select tests.expect_denied('A5b: set your own trust weight',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id, trust_weight)
    values ('abuse-z8', 'neck', 'ab000000-0000-4000-8000-000000000031', 1.0)$$);
select tests.expect_denied('A5c: claim an established identity',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id, reporter_established)
    values ('abuse-z8', 'neck', 'ab000000-0000-4000-8000-000000000031', true)$$);
select tests.expect_denied('A5d: set when the report was received, to dodge the rate limit',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id, received_at)
    values ('abuse-z8', 'neck', 'ab000000-0000-4000-8000-000000000031', now() - interval '1 day')$$);
select tests.expect_denied('A5e: read other reporters'' positions',
  $$select lat, lng from public.water_level_reports$$);
select tests.expect_denied('A5f: read who filed each report',
  $$select reporter_id from public.water_level_reports$$);
select tests.as_anon();
select tests.expect_denied('A5g: file a report without signing in',
  $$insert into public.water_level_reports (zone_id, depth_level) values ('abuse-z8', 'neck')$$);
select set_config('tests.impersonate_role', '', true), set_config('request.jwt.claims', '', true);

-- Identity age. A swarm of brand-new identities cannot raise an advisory on
-- its own, and a new identity earns nothing by checking in first.
do $$
declare
  w numeric;
begin
  -- H1: five brand-new identities, a combined trust of 1.0.
  perform tests.report_as(('ab000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'abuse-z9', 'waist')
     from generate_series(4, 8) g;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = 'abuse-z9' and is_active) then
    raise exception using errcode = 'TSTFL', message = 'H1: five brand-new identities raised an advisory';
  end if;

  -- H2: checking in first earns a new identity nothing; an established one 0.3.
  insert into public.evacuation_check_ins (zone_id, user_id, status)
    values ('abuse-z10', 'ab000000-0000-4000-8000-000000000009', 'safe'),
           ('abuse-z10', 'ab100000-0000-4000-8000-000000000012', 'safe');
  w := (tests.report_as('ab000000-0000-4000-8000-000000000009', 'abuse-z10', 'knee')).trust_weight;
  if w is distinct from 0.2 then
    raise exception using errcode = 'TSTFL', message = format('H2: a new identity that checked in weighed %s, expected 0.2', w);
  end if;
  w := (tests.report_as('ab100000-0000-4000-8000-000000000012', 'abuse-z10', 'knee')).trust_weight;
  if w is distinct from 0.5 then
    raise exception using errcode = 'TSTFL', message = format('H2: an established identity that checked in weighed %s, expected 0.5', w);
  end if;

  -- H3: the same five with one established neighbour do raise it.
  perform tests.report_as('ab100000-0000-4000-8000-000000000013', 'abuse-z9', 'waist');
  perform * from public.check_and_trigger_alerts();
  if not exists (select 1 from public.alerts where zone_id = 'abuse-z9' and is_active and source = 'auto_crowdsourced') then
    raise exception using errcode = 'TSTFL', message = 'H3: five new identities and an established one did not raise an advisory';
  end if;
  raise notice 'ok H1-H3: new identities need an established neighbour, and earn no bonuses';
end $$;

-- Layer 6, reputation. Identities whose advisory an official rejected cannot
-- raise another; a confirmed one raises their weight; nobody can forge a
-- verdict; a burned identity recovers once a confirmed advisory evens it out.
do $$
declare
  v_ids uuid[] := array[
    'ab100000-0000-4000-8000-000000000020', 'ab000000-0000-4000-8000-000000000020',
    'ab000000-0000-4000-8000-000000000021', 'ab000000-0000-4000-8000-000000000022',
    'ab000000-0000-4000-8000-000000000023']::uuid[];
  v_id uuid;
  w numeric;
begin
  -- R1: the five raise an advisory, and the official rejects it.
  foreach v_id in array v_ids loop
    perform tests.report_as(v_id, 'abuse-z11', 'knee');
  end loop;
  perform * from public.check_and_trigger_alerts();
  if not exists (select 1 from public.alerts where zone_id = 'abuse-z11' and is_active and source = 'auto_crowdsourced') then
    raise exception using errcode = 'TSTFL', message = 'R1: setup did not raise an advisory';
  end if;
  perform tests.as_official($q$select public.reject_automatic_alert('abuse-z11')$q$);
  if not exists (select 1 from public.alerts where zone_id = 'abuse-z11' and verdict = 'rejected' and not is_active) then
    raise exception using errcode = 'TSTFL', message = 'R1: the rejection was not recorded';
  end if;

  -- R2: ten minutes on, the same five report again. They weigh nothing and
  -- raise nothing. (Everything so far is moved ten minutes back, and the
  -- rejection one minute back, so the new reports come after it.)
  update public.water_level_reports
     set reported_at = now() - interval '10 minutes', received_at = now() - interval '10 minutes'
   where zone_id = 'abuse-z11';
  update public.official_actions set occurred_at = now() - interval '1 minute'
   where zone_id = 'abuse-z11' and action = 'alert.cleared';
  foreach v_id in array v_ids loop
    w := (tests.report_as(v_id, 'abuse-z11', 'knee')).trust_weight;
    if w <> 0 then
      raise exception using errcode = 'TSTFL', message = format('R2: a rejected identity weighed %s, expected 0', w);
    end if;
  end loop;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = 'abuse-z11' and is_active) then
    raise exception using errcode = 'TSTFL', message = 'R2: rejected identities raised a second advisory';
  end if;

  -- R3: a resident cannot reject an advisory, and nobody can write a verdict.
  foreach v_id in array array[
      'ab100000-0000-4000-8000-000000000021', 'ab000000-0000-4000-8000-000000000024',
      'ab000000-0000-4000-8000-000000000025', 'ab000000-0000-4000-8000-000000000026',
      'ab000000-0000-4000-8000-000000000027']::uuid[] loop
    perform tests.report_as(v_id, 'abuse-z12', 'waist');
  end loop;
  -- A burned identity reports the same real flood (see R5).
  perform tests.report_as('ab000000-0000-4000-8000-000000000020', 'abuse-z12', 'waist');
  perform * from public.check_and_trigger_alerts();
  if not exists (select 1 from public.alerts where zone_id = 'abuse-z12' and is_active and source = 'auto_crowdsourced') then
    raise exception using errcode = 'TSTFL', message = 'R3: setup did not raise an advisory';
  end if;
  perform set_config('request.jwt.claims',
    '{"sub":"ab000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.reject_automatic_alert('abuse-z12');
    raise exception using errcode = 'TSTFL', message = 'R3: a resident rejected an advisory';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.alerts set verdict = 'rejected' where zone_id = 'abuse-z12';
    raise exception using errcode = 'TSTFL', message = 'R3: a resident wrote a verdict';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  begin
    perform tests.as_official($q$update public.alerts set verdict = 'confirmed' where zone_id = 'abuse-z11'$q$);
    raise exception using errcode = 'TSTFL', message = 'R3: an official overwrote a rejection';
  exception when insufficient_privilege then null;
  end;

  -- R4: the official confirms; its reporters now weigh 0.3 more.
  perform tests.as_official($q$select public.set_zone_alert('abuse-z12', 'yellow', '{"en":"c","fil":"c"}'::jsonb)$q$);
  if not exists (select 1 from public.alerts where zone_id = 'abuse-z12' and source = 'auto_crowdsourced' and verdict = 'confirmed') then
    raise exception using errcode = 'TSTFL', message = 'R4: the confirmation was not recorded';
  end if;
  w := (tests.report_as('ab000000-0000-4000-8000-000000000024', 'abuse-z13', 'knee')).trust_weight;
  if w is distinct from 0.5 then
    raise exception using errcode = 'TSTFL', message = format('R4: a confirmed new identity weighed %s, expected 0.5', w);
  end if;

  -- R5: the burned identity that reported the confirmed flood is even again.
  w := (tests.report_as('ab000000-0000-4000-8000-000000000020', 'abuse-z13', 'knee')).trust_weight;
  if w is distinct from 0.2 then
    raise exception using errcode = 'TSTFL', message = format('R5: a burned identity with a confirmed report weighed %s, expected 0.2', w);
  end if;

  -- R6: a plain clear (the water went down) records no verdict.
  foreach v_id in array array[
      'ab100000-0000-4000-8000-000000000022', 'ab000000-0000-4000-8000-000000000032',
      'ab000000-0000-4000-8000-000000000033', 'ab000000-0000-4000-8000-000000000034',
      'ab000000-0000-4000-8000-000000000035']::uuid[] loop
    perform tests.report_as(v_id, 'abuse-z14', 'knee');
  end loop;
  perform * from public.check_and_trigger_alerts();
  if not exists (select 1 from public.alerts where zone_id = 'abuse-z14' and is_active and source = 'auto_crowdsourced') then
    raise exception using errcode = 'TSTFL', message = 'R6: setup did not raise an advisory';
  end if;
  perform tests.as_official($q$select public.set_zone_alert('abuse-z14', null, null)$q$);
  if exists (select 1 from public.alerts where zone_id = 'abuse-z14' and verdict is not null) then
    raise exception using errcode = 'TSTFL', message = 'R6: a plain clear recorded a verdict';
  end if;
  w := (tests.report_as('ab000000-0000-4000-8000-000000000032', 'abuse-z15', 'knee')).trust_weight;
  if w is distinct from 0.2 then
    raise exception using errcode = 'TSTFL', message = format('R6: a cleared advisory''s reporter weighed %s, expected 0.2', w);
  end if;
  raise notice 'ok R1-R6: rejections burn, confirmations reward, verdicts cannot be forged';
end $$;

rollback;
