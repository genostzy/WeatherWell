-- Password recovery (security questions for residents, an admin reset for
-- officials) and opt-in email alerts. All of it is rolled back.
begin;

set constraints all immediate;

-- Fixtures: a resident, a barangay official, an admin, a Google account and a
-- password account, and one barangay.
do $$
begin
  insert into auth.users (id, email) values
    ('ac000000-0000-4000-8000-000000000001', 'resident@test.local'),
    ('ac000000-0000-4000-8000-000000000002', 'official@test.local'),
    ('ac000000-0000-4000-8000-000000000003', 'admin@test.local'),
    ('ac000000-0000-4000-8000-000000000004', 'someone@gmail.com'),
    ('ac000000-0000-4000-8000-000000000005', 'password@test.local');
  insert into auth.identities (provider_id, user_id, identity_data, provider)
    values ('google-sub-4', 'ac000000-0000-4000-8000-000000000004', '{"email":"someone@gmail.com"}', 'google');
  insert into public.profiles (id, role, area_code, display_name) values
    ('ac000000-0000-4000-8000-000000000002', 'operator', '9900008', 'Test Kapitan'),
    ('ac000000-0000-4000-8000-000000000003', 'admin', null, 'Test Admin')
  on conflict (id) do update
    set role = excluded.role, area_code = excluded.area_code, display_name = excluded.display_name;
  insert into public.zones
    (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
  values ('accounts-z1', '9900008001', 'Accounts Zone', '{"en":"x","fil":"x"}'::jsonb, 15, 121, '[]'::jsonb, '000');
end $$;

-- Q1: a resident sets two questions; the answers are stored only as bcrypt hashes.
do $$
declare
  r record;
begin
  perform set_config('request.jwt.claims', '{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  perform public.set_recovery_answers('favorite_food', '  Chicken   ADOBO ', 'mobile_number', '+63 917 123 4567');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select * into r from private.recovery_answers where user_id = 'ac000000-0000-4000-8000-000000000001';
  if r.answer_1_hash ilike '%adobo%' or r.answer_1_hash !~ '^\$2[abxy]\$10\$' or r.answer_2_hash ~ '917' then
    raise exception using errcode = 'TSTFL', message = 'Q1: an answer was stored readable, or not as bcrypt';
  end if;
  raise notice 'ok Q1: answers are stored as bcrypt hashes';
end $$;

-- Q2: the right answers match whatever their case, spacing or number format;
-- a wrong one does not.
do $$
declare
  v_id uuid;
begin
  v_id := public.verify_recovery_answers(' RESIDENT@test.local', 'chicken adobo', '0917-123-4567');
  if v_id is distinct from 'ac000000-0000-4000-8000-000000000001' then
    raise exception using errcode = 'TSTFL', message = 'Q2: the right answers did not match';
  end if;
  v_id := public.verify_recovery_answers('resident@test.local', 'sinigang', '09171234567');
  if v_id is not null then
    raise exception using errcode = 'TSTFL', message = 'Q2: a wrong answer matched';
  end if;
  raise notice 'ok Q2: answers match by content, not by format';
end $$;

-- Q3: after five wrong tries in an hour the email is locked, even to the right answers.
do $$
declare
  v_msg text;
begin
  for i in 1..4 loop
    perform public.verify_recovery_answers('resident@test.local', 'wrong', '0000000000');
  end loop;
  begin
    perform public.verify_recovery_answers('resident@test.local', 'chicken adobo', '09171234567');
    raise exception using errcode = 'TSTFL', message = 'Q3: a sixth try within the hour was checked';
  exception when program_limit_exceeded then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'Too many tries' then raise; end if;
  end;
  raise notice 'ok Q3: five wrong tries lock the email for an hour';
end $$;

-- Q4: officials cannot use questions, even with answers put in by hand.
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.set_recovery_answers('favorite_food', 'adobo', 'first_pet', 'bantay');
    raise exception using errcode = 'TSTFL', message = 'Q4: an official set security questions';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into private.recovery_answers (user_id, question_1, answer_1_hash, question_2, answer_2_hash)
    values ('ac000000-0000-4000-8000-000000000002',
            'favorite_food', extensions.crypt('adobo', extensions.gen_salt('bf', 4)),
            'first_pet', extensions.crypt('bantay', extensions.gen_salt('bf', 4)));
  if public.verify_recovery_answers('official@test.local', 'adobo', 'bantay') is not null then
    raise exception using errcode = 'TSTFL', message = 'Q4: an official''s password could be reset by questions';
  end if;
  raise notice 'ok Q4: officials cannot recover by questions';
end $$;

-- Q5: the questions for an unknown email are decoys, the same on every ask,
-- so the page does not reveal who has an account; only the server may ask.
do $$
declare
  r1 record;
  r2 record;
begin
  select * into r1 from public.recovery_questions_for('resident@test.local');
  if r1.question_1 <> 'favorite_food' or r1.question_2 <> 'mobile_number' then
    raise exception using errcode = 'TSTFL', message = format('Q5: a resident got %s', r1);
  end if;
  select * into r1 from public.recovery_questions_for('nobody@test.local');
  select * into r2 from public.recovery_questions_for('NOBODY@test.local ');
  if r1.question_1 is null or r1.question_1 = r1.question_2 or r1 is distinct from r2 then
    raise exception using errcode = 'TSTFL', message = format('Q5: decoys were %s then %s', r1, r2);
  end if;
  if has_function_privilege('anon', 'public.recovery_questions_for(text)', 'execute')
     or has_function_privilege('authenticated', 'public.recovery_questions_for(text)', 'execute')
     or has_function_privilege('authenticated', 'public.verify_recovery_answers(text,text,text)', 'execute')
     or has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception using errcode = 'TSTFL', message = 'Q5: a client can reach the recovery checks';
  end if;
  raise notice 'ok Q5: unknown emails get stable decoys; only the server checks answers';
end $$;

-- Q6: only an admin can reset an official's password, never an admin's, and
-- it is recorded.
do $$
declare
  v_id uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"ac000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  v_id := public.admin_authorize_password_reset('Official@test.local');
  begin
    perform public.admin_authorize_password_reset('admin@test.local');
    raise exception using errcode = 'TSTFL', message = 'Q6: an admin''s password reset was authorised';
  exception when no_data_found then null;
  end;
  perform set_config('request.jwt.claims', '{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  begin
    perform public.admin_authorize_password_reset('official@test.local');
    raise exception using errcode = 'TSTFL', message = 'Q6: an official reset another official''s password';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_id is distinct from 'ac000000-0000-4000-8000-000000000002' then
    raise exception using errcode = 'TSTFL', message = 'Q6: the admin was not given the official''s account';
  end if;
  if not exists (select 1 from public.official_actions
                  where action = 'official.password_reset' and actor_name = 'Test Admin'
                    and detail ->> 'display_name' = 'Test Kapitan') then
    raise exception using errcode = 'TSTFL', message = 'Q6: the reset was not recorded';
  end if;
  raise notice 'ok Q6: only an admin resets an official''s password, and it is recorded';
end $$;

-- M1: email alerts need a Google account; a subscriber sees and removes only
-- their own row, never its unsubscribe token.
do $$
declare
  n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"ac000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.subscribe_email_alerts('accounts-z1');
    raise exception using errcode = 'TSTFL', message = 'M1: a password account subscribed to email alerts';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"sub":"ac000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  perform public.subscribe_email_alerts('accounts-z1');
  select count(*) into n from public.email_alert_subscriptions where zone_id = 'accounts-z1';
  if n <> 1 then
    raise exception using errcode = 'TSTFL', message = 'M1: the Google account cannot see its own subscription';
  end if;
  begin
    perform unsubscribe_token from public.email_alert_subscriptions;
    raise exception using errcode = 'TSTFL', message = 'M1: a subscriber read an unsubscribe token';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"sub":"ac000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  select count(*) into n from public.email_alert_subscriptions;
  delete from public.email_alert_subscriptions;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if n <> 0 or not exists (select 1 from public.email_alert_subscriptions) then
    raise exception using errcode = 'TSTFL', message = 'M1: one account saw or removed another''s subscription';
  end if;
  raise notice 'ok M1: Google accounts only, and each sees only its own';
end $$;

-- M2: recipients are the barangay's subscribers and the named accounts, and
-- never a password account; the unsubscribe link removes exactly one.
do $$
declare
  v_token uuid;
  n int;
begin
  insert into public.email_alert_subscriptions (user_id, zone_id)
    values ('ac000000-0000-4000-8000-000000000005', 'accounts-z1');
  select count(*) into n from public.email_alert_recipients('accounts-z1');
  if n <> 1 or not exists (select 1 from public.email_alert_recipients('accounts-z1') where email = 'someone@gmail.com') then
    raise exception using errcode = 'TSTFL', message = 'M2: the barangay''s recipients were wrong';
  end if;
  if not exists (select 1 from public.email_alert_recipients(null, array['ac000000-0000-4000-8000-000000000004'::uuid])) then
    raise exception using errcode = 'TSTFL', message = 'M2: a named subscriber was not a recipient';
  end if;
  select unsubscribe_token into v_token from public.email_alert_subscriptions
   where user_id = 'ac000000-0000-4000-8000-000000000004';
  if not public.unsubscribe_email_alerts(v_token) or public.unsubscribe_email_alerts(v_token) then
    raise exception using errcode = 'TSTFL', message = 'M2: unsubscribing did not remove exactly once';
  end if;
  if has_function_privilege('anon', 'public.unsubscribe_email_alerts(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.email_alert_recipients(text,uuid[])', 'execute') then
    raise exception using errcode = 'TSTFL', message = 'M2: a client can list recipients or unsubscribe others';
  end if;
  raise notice 'ok M2: recipients are Google subscribers only; the link unsubscribes once';
end $$;

-- DR1-DR6: a resident downloads and deletes their data. Reports stay,
-- anonymised; pins stay, detached, their photo paths handed back for
-- deleting; votes, check-ins and recovery attempts go. Officials and the
-- admin cannot use it.
create or replace function tests.dr_report(p_uid uuid, p_zone text) returns void
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
    values (p_zone, 'knee', p_uid, v_lat, v_lng);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$
declare
  a constant uuid := 'ad000000-0000-4000-8000-000000000001';
  b constant uuid := 'ad000000-0000-4000-8000-000000000002';
  c constant uuid := 'ad000000-0000-4000-8000-000000000003';
  v_paths text[];
  u uuid;
  v_alert uuid;
  n int;
  m int;
  r record;
begin
  insert into auth.users (id, email, created_at) values
    (a, 'dr-a@test.local', now() - interval '2 days'),
    (b, 'dr-b@test.local', now() - interval '2 days'),
    (c, 'dr-c@test.local', now() - interval '2 days');
  insert into public.zones
    (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
    select 'dr-z' || g, '9900008' || (200 + g)::text, 'Data Zone ' || g,
           '{"en":"x","fil":"x"}'::jsonb, 15 + g * 0.2, 121.5, '[]'::jsonb, '000'
      from generate_series(1, 3) g;
  perform tests.dr_report(a, 'dr-z1');
  perform tests.dr_report(a, 'dr-z2');
  perform tests.dr_report(a, 'dr-z3');
  perform tests.dr_report(b, 'dr-z3');
  perform tests.dr_report(c, 'dr-z3');
  insert into public.community_pins (id, zone_id, author_id, status_tag, caption, lat, lng, photo_path)
    values ('ad100000-0000-4000-8000-000000000001', 'dr-z1', a, 'flooded', 'a pin', 15.2, 121.5, 'ad000000-0000-4000-8000-000000000001/p.jpg'),
           ('ad100000-0000-4000-8000-000000000003', 'dr-z1', b, 'flooded', 'b pin', 15.2, 121.5, 'ad000000-0000-4000-8000-000000000002/q.jpg');
  insert into public.community_pins (id, zone_id, author_id, status_tag, caption, lat, lng, removed, removed_reason)
    values ('ad100000-0000-4000-8000-000000000002', 'dr-z1', a, 'other', 'a removed pin', 15.2, 121.5, true, 'admin');
  insert into public.pin_votes (pin_id, voter_id, direction) values
    ('ad100000-0000-4000-8000-000000000003', a, 1),
    ('ad100000-0000-4000-8000-000000000001', b, 1);
  insert into public.evacuation_check_ins (zone_id, user_id, status) values ('dr-z1', a, 'safe'), ('dr-z1', b, 'safe');
  insert into private.recovery_attempts (email, succeeded) values ('dr-a@test.local', false), ('dr-b@test.local', false);
  perform public.set_zone_alert('dr-z3', 'yellow', '{"en":"a","fil":"a"}'::jsonb, 'auto_crowdsourced');
  select id into v_alert from public.alerts where zone_id = 'dr-z3' and is_active;
  if (select e.reporters from private.report_evidence('dr-z3', null) e) <> 3 then
    raise exception using errcode = 'TSTFL', message = 'DR3: the fixture did not count three reporters';
  end if;

  -- DR6: a resident reads back their own report positions, and no one else's.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Three of the five reports in the fixture are theirs; anyone else's would make more.
  select count(*) filter (where p.lat is not null and p.lng is not null), count(*) into n, m
    from public.my_report_positions() p;
  if n <> 3 or m <> 3 then
    reset role;
    raise exception using errcode = 'TSTFL', message = format('DR6: read %s positions of %s rows; expected 3 of 3', n, m);
  end if;

  -- DR1: deleting anonymises the reports, detaches the pins and hands back the photo path.
  v_paths := public.delete_my_data();
  reset role;
  if v_paths is distinct from array['ad000000-0000-4000-8000-000000000001/p.jpg'] then
    raise exception using errcode = 'TSTFL', message = format('DR1: returned %s', v_paths);
  end if;
  for r in select * from public.water_level_reports where zone_id like 'dr-z%' and depth_level = 'knee'
             and reporter_id is null loop
    if r.lat is not null or r.lng is not null or r.located or r.reported_at is null or r.zone_id is null then
      raise exception using errcode = 'TSTFL', message = format('DR1: a report kept %s', r);
    end if;
  end loop;
  select count(*) into n from public.water_level_reports where reporter_id is null and zone_id like 'dr-z%';
  if n <> 3 or exists (select 1 from public.water_level_reports where reporter_id = a) then
    raise exception using errcode = 'TSTFL', message = format('DR1: %s of 3 reports anonymised', n);
  end if;
  if exists (select 1 from public.community_pins where author_id = a)
     or (select photo_path from public.community_pins where id = 'ad100000-0000-4000-8000-000000000001') is not null
     or exists (select 1 from public.pin_votes where voter_id = a)
     or exists (select 1 from public.evacuation_check_ins where user_id = a)
     or exists (select 1 from private.recovery_attempts where email = 'dr-a@test.local') then
    raise exception using errcode = 'TSTFL', message = 'DR1: a pin, vote, check-in or recovery attempt was kept';
  end if;

  -- DR2: a pin an official had removed is detached too, and stays removed.
  if (select author_id is not null or not removed from public.community_pins where id = 'ad100000-0000-4000-8000-000000000002') then
    raise exception using errcode = 'TSTFL', message = 'DR2: the removed pin was not detached, or came back';
  end if;

  -- DR3: the advisory's evidence counts one fewer reporter; the advisory itself is untouched.
  if (select e.reporters from private.report_evidence('dr-z3', null) e) <> 2
     or not (select is_active from public.alerts where id = v_alert) then
    raise exception using errcode = 'TSTFL', message = 'DR3: an anonymised report still counted, or the advisory broke';
  end if;

  -- DR4: the other resident keeps everything; officials and the admin are refused; anon cannot call it.
  if (select count(*) from public.water_level_reports where reporter_id = b) <> 1
     or (select author_id from public.community_pins where id = 'ad100000-0000-4000-8000-000000000003') <> b
     or (select photo_path from public.community_pins where id = 'ad100000-0000-4000-8000-000000000003') is null
     or not exists (select 1 from public.pin_votes where voter_id = b)
     or not exists (select 1 from public.evacuation_check_ins where user_id = b)
     or not exists (select 1 from private.recovery_attempts where email = 'dr-b@test.local') then
    raise exception using errcode = 'TSTFL', message = 'DR4: another resident''s data changed';
  end if;
  foreach u in array array['ac000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000003']::uuid[] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.delete_my_data();
      reset role;
      raise exception using errcode = 'TSTFL', message = format('DR4: %s deleted their data', u);
    exception when insufficient_privilege then reset role;
    end;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  if has_function_privilege('anon', 'public.delete_my_data()', 'execute')
     or has_function_privilege('anon', 'public.my_report_positions()', 'execute') then
    raise exception using errcode = 'TSTFL', message = 'DR4: anon can call the data functions';
  end if;

  -- DR5: a second call finds nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_paths := public.delete_my_data();
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_paths is distinct from '{}'::text[] then
    raise exception using errcode = 'TSTFL', message = format('DR5: a second call returned %s', v_paths);
  end if;
  raise notice 'ok DR1-DR6: a resident''s data is anonymised or deleted in one step, and only theirs';
end $$;

rollback;
