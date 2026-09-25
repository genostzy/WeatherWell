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

rollback;
