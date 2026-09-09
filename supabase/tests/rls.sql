begin;

-- A resident must never be able to promote themselves. RLS on `profiles` has
-- no UPDATE policy at all, so a self-promotion update is not denied with an
-- error — it is silently filtered to zero rows. The security property is "a
-- resident cannot become an operator", proven here as an unchanged-value
-- assertion rather than tests.expect_denied (which requires a thrown error).
--
-- This block does its own role switch rather than going through
-- tests.as_user(), because tests.as_user() only records the desired
-- impersonation for expect_denied/expect_allowed (see helpers.sql) — it does
-- not itself switch the ambient role. A plain top-level statement like the
-- UPDATE below needs the real switch done directly.
do $$
declare
  fixture_id uuid := '11111111-1111-1111-1111-111111111111';
  observed_role text;
begin
  -- Fixture: insert a real auth.users row (bypassing RLS as postgres) and let
  -- the on_auth_user_created trigger create the matching profile.
  insert into auth.users (id) values (fixture_id);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', fixture_id::text, 'role', 'authenticated')::text, true);

  -- Two independent layers refuse this now: profiles has no UPDATE policy (a
  -- silent zero-row filter) AND `authenticated` no longer holds the UPDATE
  -- grant (a raised 42501). Which layer bites first is not the property under
  -- test -- "a resident cannot become an operator" is -- so the raise is
  -- caught and the assertion remains the unchanged-value check below. Without
  -- the catch, the grant denial would abort the whole suite.
  begin
    update public.profiles set role = 'operator' where id = fixture_id;
  exception when insufficient_privilege then
    raise notice 'ok: profiles UPDATE refused outright (no grant), not merely filtered';
  end;

  reset role;

  select role into observed_role from public.profiles where id = fixture_id;

  if observed_role is distinct from 'resident' then
    raise exception using errcode = 'TSTFL',
      message = format(
        'SECURITY TEST FAILED — resident self-promoted to role: %s', observed_role);
  end if;
  raise notice 'ok: resident cannot change their own role (still resident)';
end $$;

-- The operator check must not be directly callable by anyone: schema
-- `private` grants no USAGE to anon or authenticated, so
-- `select private.is_operator()` fails name resolution regardless of the
-- function's own EXECUTE grants. That means this assertion passes no matter
-- how EXECUTE is configured — it does NOT settle whether a policy can call a
-- function the querying role lacks EXECUTE on. That question is settled
-- separately by a scratch-table policy experiment (see task-2-report.md).
--
-- Separately, and this is what DOES matter operationally: an earlier draft
-- revoked EXECUTE from `authenticated` too, and that broke policy evaluation
-- — profiles_read_own_or_operator calls this function while running AS
-- authenticated, so revoking from authenticated turns an ordinary own-row
-- read into "permission denied for function is_operator" (see the identity
-- migration's comment). The settled shape revokes from public and anon only.
select tests.as_anon();
select tests.expect_denied(
  'anon cannot call private.is_operator() directly',
  $$select private.is_operator()$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'authenticated cannot call private.is_operator() directly either (schema `private` has no USAGE grant)',
  $$select private.is_operator()$$);

-- Alerts: the table the whole product exists to serve. zones is empty until
-- Task 5, so a fixture zone is inserted here (as postgres, bypassing RLS)
-- purely to satisfy alerts.zone_id's foreign key — it is not seed data.
insert into public.zones
  (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
values
  ('tests-fixture-zone', '000000000', 'Test Zone', '{"en":"x","fil":"x"}'::jsonb, 14.0, 121.0, '[]'::jsonb, '000');

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'resident cannot issue an alert',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('tests-fixture-zone', 'evacuate', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

select tests.as_anon();
select tests.expect_denied(
  'anonymous role cannot issue an alert',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('tests-fixture-zone', 'evacuate', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

-- Plain assertion (not through expect_denied/expect_allowed) that the
-- one-active-per-zone invariant is enforced by the database itself, not by
-- client convention: running as postgres bypasses RLS entirely, so this
-- proves the partial unique index, not a policy.
do $$
begin
  set local role postgres;
  insert into public.alerts (zone_id, severity, message, source)
    values ('tests-fixture-zone','red','{"en":"a","fil":"a"}'::jsonb,'manual');
  begin
    insert into public.alerts (zone_id, severity, message, source)
      values ('tests-fixture-zone','yellow','{"en":"b","fil":"b"}'::jsonb,'manual');
    raise exception using errcode = 'TSTFL',
      message = 'two active alerts were allowed for one zone';
  exception
    when unique_violation then raise notice 'ok: one active alert per zone enforced';
  end;
  -- Minor 8: this block set local role postgres and never reset it. Harmless
  -- while the whole suite runs as postgres, but it would leak the role into
  -- every assertion after this block the moment the suite runs under any
  -- other role. Every helper resets on every exit path (see helpers.sql);
  -- this raw block must hold itself to the same rule.
  reset role;
end $$;

-- Critical 1: an operator fixture. tests.expect_allowed exists in
-- helpers.sql and, before this change, was never called anywhere in this
-- suite — every assertion was a denial, so a total failure of
-- private.is_operator() (it always returning false, e.g. because a future
-- migration touching `private` grants breaks its EXECUTE grant) would still
-- leave every existing test green. These assertions require is_operator()
-- to actually return true at least once, which is the property nothing
-- here tested before.
do $$
declare
  operator_id uuid := '33333333-3333-3333-3333-333333333333';
begin
  insert into auth.users (id) values (operator_id);
  update public.profiles set role = 'operator' where id = operator_id;
end $$;

-- A second fixture zone, isolated from tests-fixture-zone (which already
-- carries an active 'red' alert from the uniqueness block above) so the
-- operator's insert below cannot collide with alerts_one_active_per_zone
-- and fail with unique_violation instead of proving the allow path.
insert into public.zones
  (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
values
  ('tests-fixture-zone-2', '000000001', 'Test Zone 2', '{"en":"x","fil":"x"}'::jsonb, 14.1, 121.1, '[]'::jsonb, '000');

select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_allowed(
  'an operator CAN issue an alert',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('tests-fixture-zone-2', 'red', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

-- Community tables: reports, pins, votes, check-ins — everything a resident
-- writes. Two fixture users: 1111... acts as the resident under test,
-- 2222... is the "someone else" every ownership trap tries to write as.
-- 1111... already exists in auth.users from the self-promotion fixture
-- above; 2222... is new here. Both are needed as real rows (not just UUIDs)
-- because reporter_id/author_id/user_id all carry FK constraints to
-- auth.users — without the FK target existing, these statements would fail
-- with foreign_key_violation before ever reaching the RLS policy, proving
-- nothing about ownership enforcement.
insert into auth.users (id) values ('22222222-2222-2222-2222-222222222222');

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'resident cannot file a report attributed to another user',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id)
    values ('tests-fixture-zone', 'knee', '22222222-2222-2222-2222-222222222222')$$);

-- The WITH CHECK trap: passing USING on the way in, then reassigning on the
-- way out. Against an empty table this UPDATE would match zero rows and
-- succeed trivially (RLS filters rows, it does not raise) — so a real pin
-- owned by 1111... is inserted first, as postgres, bypassing RLS.
insert into public.community_pins (zone_id, status_tag, caption, lat, lng, author_id)
values ('tests-fixture-zone', 'passable', 'fixture pin', 14.0, 121.0,
        '11111111-1111-1111-1111-111111111111');

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'resident cannot reassign their own pin to another author',
  $$update public.community_pins
      set author_id = '22222222-2222-2222-2222-222222222222'
    where author_id = '11111111-1111-1111-1111-111111111111'$$);

-- Check-ins name a person and say whether they need help.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'resident cannot record a check-in as another user',
  $$insert into public.evacuation_check_ins (zone_id, user_id, status)
    values ('tests-fixture-zone', '22222222-2222-2222-2222-222222222222', 'needs_help')$$);

-- A resident reading another resident's check-in must return zero rows, not
-- an error. Asserting this against an empty table would pass trivially, so a
-- check-in owned by 2222... is inserted first, as postgres.
insert into public.evacuation_check_ins (zone_id, user_id, status)
values ('tests-fixture-zone', '22222222-2222-2222-2222-222222222222', 'safe');

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_row_count(
  'a resident cannot see another resident''s check-in',
  $$select * from public.evacuation_check_ins
    where user_id = '22222222-2222-2222-2222-222222222222'$$,
  0);

-- Critical 1, continued: an operator CAN read another resident's check-in —
-- the other half of checkins_read_own_or_operator that the denial test above
-- never exercised. Reuses the 2222... check-in inserted above.
select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_row_count(
  'an operator CAN see another resident''s check-in',
  $$select * from public.evacuation_check_ins
    where user_id = '22222222-2222-2222-2222-222222222222'$$,
  1);

-- Critical 1, continued: the spec's own framing — "a resident can still read
-- pins, and cannot call private.is_operator() directly" — only ever had its
-- second half tested. Reuses the fixture pin inserted above.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_row_count(
  'a resident CAN read pins',
  $$select * from public.community_pins where author_id = '11111111-1111-1111-1111-111111111111'$$,
  1);

-- Important 2: pins_update_own_or_operator grants the author UPDATE on every
-- column, including removed/removed_reason — so on its own it lets an author
-- undo an operator's moderation by simply reissuing their own pin. Column
-- GRANTs cannot fix that either: residents and operators are the same
-- `authenticated` Postgres role. A BEFORE UPDATE trigger is what draws the
-- line, because it is the only mechanism that sees OLD and NEW at once (a
-- policy's USING sees only the old row, WITH CHECK only the new one).
--
-- The rule is one-directional, and this is the half that must NOT be denied:
-- deleting your own pin is a soft delete, so it SETS removed = true. Only
-- CLEARING removed is an operator's privilege (otherwise the author of a pin
-- taken down by net-score voting simply puts it back).
--
-- This assertion is deliberately placed before any privileged UPDATE touches
-- community_pins in this session. The moderation trigger used to be a plpgsql
-- body calling private.is_operator(); plpgsql resolves the names in a body
-- lazily, at first execution, as the *invoking* role, and `authenticated` has
-- no USAGE on schema `private`. Every pin UPDATE issued by `authenticated` on
-- a fresh connection therefore failed with "permission denied for schema
-- private" (SQLSTATE 42501) -- residents and operators alike, including plain
-- caption edits. This suite passed anyway, because the postgres UPDATE just
-- below compiled the trigger body under a role that COULD resolve the name,
-- and every later authenticated UPDATE in the same session reused the cached
-- plan. Ordering this assertion first is what keeps that regression caught.
-- The condition now lives in the trigger's WHEN clause, which is stored
-- OID-resolved like a policy expression, so nothing re-resolves it at runtime.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_allowed(
  'the pin''s own author CAN soft-delete their own pin (removed = true)',
  $$update public.community_pins set removed = true
    where author_id = '11111111-1111-1111-1111-111111111111'$$);

update public.community_pins set removed = true, removed_reason = 'admin'
  where author_id = '11111111-1111-1111-1111-111111111111';

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'the pin''s own author cannot un-remove it',
  $$update public.community_pins set removed = false
    where author_id = '11111111-1111-1111-1111-111111111111'$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'the pin''s own author cannot change removed_reason either',
  $$update public.community_pins set removed_reason = null
    where author_id = '11111111-1111-1111-1111-111111111111'$$);

select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_allowed(
  'an operator CAN restore a removed pin',
  $$update public.community_pins set removed = false, removed_reason = null
    where author_id = '11111111-1111-1111-1111-111111111111'$$);

-- Important 3: trust_weight/is_outlier feed the weighted-consensus engine
-- and must not be client-settable. reports_insert_own only ever checked
-- reporter_id; the column-scoped INSERT grant is what actually stops this.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot inflate their own report''s trust_weight',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id, trust_weight)
    values ('tests-fixture-zone', 'neck', '11111111-1111-1111-1111-111111111111', 1000000000)$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot mark their own report a non-outlier by fiat',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id, is_outlier)
    values ('tests-fixture-zone', 'neck', '11111111-1111-1111-1111-111111111111', false)$$);

-- Important 4, bullet 1: reference tables have no write policy at all, so
-- the only thing stopping a resident from rewriting the literal evacuation
-- instructions is the absence of a policy — nothing exercised that absence.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot insert a zone',
  $$insert into public.zones
      (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
    values ('tests-fixture-rogue-zone', '999999999', 'Rogue', '{"en":"x","fil":"x"}'::jsonb, 0, 0, '[]'::jsonb, '000')$$);

-- zones has no UPDATE policy at all, so — exactly like the profiles
-- self-promotion case at the top of this file — a resident's UPDATE is not
-- denied with an error. It silently matches zero rows (confirmed: an
-- UPDATE whose USING clause excludes every row succeeds with row_count 0,
-- it does not raise). expect_denied cannot express this; it requires a
-- thrown exception. Proven here as an unchanged-value assertion instead.
do $$
declare
  original jsonb;
  observed jsonb;
begin
  select evacuation_route_text into original from public.zones where id = 'tests-fixture-zone';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

  -- Same two-layer situation as the profiles block above: no UPDATE policy
  -- (zero rows) AND no UPDATE grant (42501). Caught so the unchanged-value
  -- assertion below stays the thing being proven.
  begin
    update public.zones set evacuation_route_text = '{"en":"go the wrong way","fil":"x"}'::jsonb
      where id = 'tests-fixture-zone';
  exception when insufficient_privilege then
    raise notice 'ok: zones UPDATE refused outright (no grant), not merely filtered';
  end;

  reset role;

  select evacuation_route_text into observed from public.zones where id = 'tests-fixture-zone';

  if observed is distinct from original then
    raise exception using errcode = 'TSTFL',
      message = 'SECURITY TEST FAILED — resident updated zones.evacuation_route_text (the literal evacuation instructions)';
  end if;
  raise notice 'ok: resident cannot update zones.evacuation_route_text (no policy exists, update matched zero rows)';
end $$;

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot insert an evacuation center',
  $$insert into public.evacuation_centers (id, zone_id, name, lat, lng, capacity)
    values ('tests-fixture-center', 'tests-fixture-zone', 'Rogue Center', 0, 0, 1)$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot insert a point of interest',
  $$insert into public.points_of_interest (id, zone_id, category, name, lat, lng)
    values ('tests-fixture-poi', 'tests-fixture-zone', 'market', 'Rogue POI', 0, 0)$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot insert a hazard susceptibility rating',
  $$insert into public.hazard_susceptibility (id, zone_id, hazard_type, risk_level)
    values ('tests-fixture-hazard', 'tests-fixture-zone', 'flood', 'low')$$);

-- Important 4, bullet 2: pin_votes appeared nowhere in this suite. The
-- primary key (pin_id, voter_id) is what stops a double vote — a database
-- constraint, not RLS — so it is proven the same way the one-active-alert
-- invariant above is: a raw role switch catching the constraint violation,
-- with an explicit reset on every path per Minor 8.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

  insert into public.pin_votes (pin_id, voter_id, direction)
  select id, '11111111-1111-1111-1111-111111111111', 1
  from public.community_pins
  where author_id = '11111111-1111-1111-1111-111111111111';

  begin
    insert into public.pin_votes (pin_id, voter_id, direction)
    select id, '11111111-1111-1111-1111-111111111111', -1
    from public.community_pins
    where author_id = '11111111-1111-1111-1111-111111111111';
    raise exception using errcode = 'TSTFL',
      message = 'a resident voted twice on the same pin';
  exception
    when unique_violation then raise notice 'ok: one vote per person per pin enforced';
  end;

  reset role;
end $$;

-- Important 4, bullet 2, continued: nor can a resident change someone
-- else's vote. 2222... votes on the fixture pin (as postgres); 1111... then
-- tries to overwrite it.
insert into public.pin_votes (pin_id, voter_id, direction)
select id, '22222222-2222-2222-2222-222222222222', 1
from public.community_pins
where author_id = '11111111-1111-1111-1111-111111111111';

-- votes_update_own's USING clause excludes 2222...'s row for a caller who
-- isn't 2222..., so — same reasoning as the zones update above — this is
-- not an error, it is a silent zero-row update. Unchanged-value assertion.
do $$
declare
  original smallint;
  observed smallint;
begin
  select direction into original from public.pin_votes
    where voter_id = '22222222-2222-2222-2222-222222222222';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

  -- `direction` is still an updatable column for authenticated (it is the
  -- vote), so this is a pure RLS zero-row filter today. Caught anyway, so a
  -- future narrowing of the grant strengthens this test instead of aborting
  -- the suite.
  begin
    update public.pin_votes set direction = -1
      where voter_id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then
    raise notice 'ok: pin_votes UPDATE refused outright (no grant), not merely filtered';
  end;

  reset role;

  select direction into observed from public.pin_votes
    where voter_id = '22222222-2222-2222-2222-222222222222';

  if observed is distinct from original then
    raise exception using errcode = 'TSTFL',
      message = 'SECURITY TEST FAILED — resident changed another resident''s vote';
  end if;
  raise notice 'ok: resident cannot change another resident''s vote (unchanged, update matched zero rows)';
end $$;

-- Important 4, bullet 3: insert was tested, update was not. Reuses the
-- active 'red' alert on tests-fixture-zone from the uniqueness block above.
-- alerts_update_operator's USING clause is is_operator(), which is false
-- for a resident on every row, so — same reasoning again — no error, just
-- a zero-row update. Unchanged-value assertion.
do $$
declare
  original text;
  observed text;
begin
  select severity into original from public.alerts
    where zone_id = 'tests-fixture-zone' and is_active;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

  -- `severity` is no longer an updatable column for authenticated at all (an
  -- issued alert's severity is not editable in place; a downgrade supersedes
  -- the row instead), so this is now a raised 42501 rather than the zero-row
  -- filter it used to be. Caught, because the property under test is still
  -- "the live alert did not change".
  begin
    update public.alerts set severity = 'yellow'
      where zone_id = 'tests-fixture-zone' and is_active;
  exception when insufficient_privilege then
    raise notice 'ok: alerts UPDATE refused outright (severity not granted), not merely filtered';
  end;

  reset role;

  select severity into observed from public.alerts
    where zone_id = 'tests-fixture-zone' and is_active;

  if observed is distinct from original then
    raise exception using errcode = 'TSTFL',
      message = 'SECURITY TEST FAILED — resident updated an alert';
  end if;
  raise notice 'ok: resident cannot update an alert (unchanged, update matched zero rows)';
end $$;

-- Important 4, bullet 4: anon was only ever tested against alerts insert.
-- Anonymous users carry the `authenticated` Postgres role, so a role-only
-- check would pass them — every ownership-scoped policy here is what
-- actually stops them, and none of it was exercised for anon before.
select tests.as_anon();
select tests.expect_denied(
  'anon cannot create a pin',
  $$insert into public.community_pins (zone_id, status_tag, caption, lat, lng, author_id)
    values ('tests-fixture-zone', 'passable', 'anon pin', 14.0, 121.0,
            '11111111-1111-1111-1111-111111111111')$$);

select tests.as_anon();
select tests.expect_denied(
  'anon cannot vote on a pin',
  $$insert into public.pin_votes (pin_id, voter_id, direction)
    select id, '11111111-1111-1111-1111-111111111111', 1
    from public.community_pins where author_id = '11111111-1111-1111-1111-111111111111'$$);

select tests.as_anon();
select tests.expect_denied(
  'anon cannot file a water-level report',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id)
    values ('tests-fixture-zone', 'knee', '11111111-1111-1111-1111-111111111111')$$);

select tests.as_anon();
select tests.expect_denied(
  'anon cannot record a check-in',
  $$insert into public.evacuation_check_ins (zone_id, user_id, status)
    values ('tests-fixture-zone', '11111111-1111-1111-1111-111111111111', 'safe')$$);

rollback;
