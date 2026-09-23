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
    update public.profiles
       set role = 'operator', area_code = '0000000', display_name = 'Test Operator'
     where id = fixture_id;
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
-- — profiles_read_own_or_operator (since replaced by profiles_read_own)
-- called this function while running AS
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
  update public.profiles
     set role = 'operator', area_code = '0000000', display_name = 'Test Operator'
   where id = operator_id;
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

-- Task 8 defect fix: the denial above, and the trust_weight/is_outlier
-- column-grant denials further down (Important 3), had no ALLOW pairing
-- anywhere in this file -- every water_level_reports assertion was a
-- denial. Per the project rule that a grant-refusal assertion proves
-- nothing without a same-shape success case, this is that pairing: the
-- same insert shape, as the report's own reporter, with no trust_weight/
-- is_outlier override, must succeed.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_allowed(
  'a resident CAN file a water-level report as themselves',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id)
    values ('tests-fixture-zone', 'ankle', '11111111-1111-1111-1111-111111111111')$$);

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

-- Task 8 gap: since 20260909080337_harden_community_grants.sql, author_id
-- is no longer in the authenticated UPDATE column grant on community_pins
-- (`grant update (status_tag, caption, removed, removed_reason)` — author_id
-- is absent). So the denial just above is now refused by the *column grant*
-- before pins_update_own_or_in_area's WITH CHECK is ever reached — a
-- stronger refusal, but one that leaves the WITH CHECK clause completely
-- unexercised by anything in this suite. Two assertions close that:
--
-- 1. Prove the denial above really is the grant and not some blanket
--    refusal of this row: the same caller, same row, updating a column the
--    grant DOES allow must still succeed. Per the project rule that a
--    grant-refusal assertion is worthless without this pairing (both
--    42501s look identical from outside).
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_allowed(
  'the same resident CAN still update their own pin''s caption (proves the reassignment denial above is the author_id column grant, not a blanket refusal of the row)',
  $$update public.community_pins set caption = 'fixture pin, edited'
    where author_id = '11111111-1111-1111-1111-111111111111'$$);

-- Task 8 defect fix: expect_allowed only proves the UPDATE didn't raise --
-- an UPDATE matching zero rows also doesn't raise, so without this the
-- assertion above would pass vacuously and prove nothing about which
-- column the grant refuses.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_row_count(
  'the caption edit above actually landed',
  $$select * from public.community_pins
    where author_id = '11111111-1111-1111-1111-111111111111' and caption = 'fixture pin, edited'$$,
  1);

-- 2. Restore coverage of the WITH CHECK clause itself: grant UPDATE
--    (author_id) locally, for this one assertion only, so the reassignment
--    attempt clears the grant gate and actually reaches RLS. This grant
--    lives inside the outer `begin` this whole file opens with — the
--    trailing `rollback` undoes it, so production's grant (no author_id)
--    is never touched by running this suite. Revoked explicitly right
--    after anyway, so a failure partway through this block cannot leave it
--    live for any assertion that runs after it.
grant update (author_id) on public.community_pins to authenticated;

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'pins_update_own_or_in_area WITH CHECK refuses author_id reassignment even when the column grant allows it through',
  $$update public.community_pins
      set author_id = '22222222-2222-2222-2222-222222222222'
    where author_id = '11111111-1111-1111-1111-111111111111'$$);

revoke update (author_id) on public.community_pins from authenticated;

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
-- the other half of checkins_read_own_or_in_area that the denial test above
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

-- Important 2: pins_update_own_or_in_area grants the author UPDATE on every
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
--
-- tests.expect_allowed only proves the UPDATE didn't raise -- an UPDATE
-- matching zero rows (e.g. RLS silently filtering the row away) also
-- doesn't raise, so it would pass this assertion vacuously while the delete
-- path stayed dead. Pair it with tests.expect_row_count so the assertion
-- also proves the row was actually written.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_allowed(
  'the pin''s own author CAN soft-delete their own pin (removed = true)',
  $$update public.community_pins set removed = true
    where author_id = '11111111-1111-1111-1111-111111111111'$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_row_count(
  'the soft-delete above actually landed (removed = true on the author''s pin)',
  $$select * from public.community_pins
    where author_id = '11111111-1111-1111-1111-111111111111' and removed = true$$,
  1);

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

-- Task 8 defect fix: same reasoning as the caption-edit row-count above --
-- expect_allowed alone does not prove the UPDATE matched any rows.
select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_row_count(
  'the operator''s restore above actually landed (removed = false, removed_reason = null)',
  $$select * from public.community_pins
    where author_id = '11111111-1111-1111-1111-111111111111'
      and removed = false and removed_reason is null$$,
  1);

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

-- Task 8 defect fix: assertion 3 ("a resident cannot change another
-- person's vote", below) had no ALLOW pairing anywhere in this file --
-- every pin_votes UPDATE assertion was a denial, so a votes_update_own
-- policy that denied everyone would still pass every test here. 1111...'s
-- fixture vote cast just above (direction 1, on their own fixture pin) is
-- their own row, so votes_update_own's `(select auth.uid()) = voter_id`
-- should let them flip it.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_allowed(
  'a resident CAN change their own vote''s direction',
  $$update public.pin_votes set direction = -1
    where voter_id = '11111111-1111-1111-1111-111111111111'$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_row_count(
  'the vote-direction change above actually landed',
  $$select * from public.pin_votes
    where voter_id = '11111111-1111-1111-1111-111111111111' and direction = -1$$,
  1);

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

-- Task 4 fix round 1: the net-score removal margin (PRD Anti-Abuse layer 10)
-- used to have a TypeScript unit test directly against
-- exceedsRemovalThreshold in src/lib/community-pin.ts. That predicate (and
-- its hand-kept threshold copy) is gone now — private.apply_net_score_removal
-- (the trigger created by supabase/migrations/
-- 20260910071158_pin_votes_apply_net_score_removal.sql) is the sole
-- mechanism that decides and performs removal, so its margin is what these
-- two assertions prove. This is the trigger's own business logic, not the
-- RLS boundary around voting (Important 4, bullet 2, above already covers
-- that), so fixture votes are inserted directly as postgres, the same way
-- the one-active-alert and one-vote-per-person invariants above are: an
-- AFTER INSERT trigger fires regardless of which role performs the insert,
-- so switching roles here would prove nothing extra about this property.
-- Each vote is its own INSERT, cast one at a time, matching how the
-- migration's own comment says this was proven live.
insert into auth.users (id)
values
  ('66666666-6666-6666-6666-666666666666'), -- author of both fixture pins below
  ('77777777-0000-0000-0000-000000000001'),
  ('77777777-0000-0000-0000-000000000002'),
  ('77777777-0000-0000-0000-000000000003'),
  ('77777777-0000-0000-0000-000000000004'),
  ('77777777-0000-0000-0000-000000000005'),
  ('77777777-0000-0000-0000-000000000006'),
  ('77777777-0000-0000-0000-000000000007'),
  ('77777777-0000-0000-0000-000000000008'),
  ('77777777-0000-0000-0000-000000000009'),
  ('77777777-0000-0000-0000-000000000010'),
  ('77777777-0000-0000-0000-000000000011'),
  ('77777777-0000-0000-0000-000000000012');

insert into public.community_pins (id, zone_id, status_tag, caption, lat, lng, author_id)
values
  ('88888888-8888-8888-8888-000000000001', 'tests-fixture-zone', 'flooded',
   'net-score fixture: 0 up / 5 down, margin 5, at the threshold', 14.2, 121.2,
   '66666666-6666-6666-6666-666666666666'),
  ('88888888-8888-8888-8888-000000000002', 'tests-fixture-zone', 'flooded',
   'net-score fixture: 4 up / 8 down, margin 4, below the threshold', 14.3, 121.3,
   '66666666-6666-6666-6666-666666666666');

-- 5 downvotes, 0 upvotes: margin 5, exactly at the threshold -> removed.
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000001', '77777777-0000-0000-0000-000000000001', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000001', '77777777-0000-0000-0000-000000000002', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000001', '77777777-0000-0000-0000-000000000003', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000001', '77777777-0000-0000-0000-000000000004', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000001', '77777777-0000-0000-0000-000000000005', -1);

select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_row_count(
  'net-score trigger removes a pin at 5 down / 0 up (margin 5, at the threshold)',
  $$select * from public.community_pins
    where id = '88888888-8888-8888-8888-000000000001'
      and removed = true and removed_reason = 'net_score'$$,
  1);

-- 8 downvotes, 4 upvotes: margin 4, one short of the threshold -> survives.
-- This is the whole point of a margin rather than a raw downvote count
-- (PRD Anti-Abuse layer 10): this pin's raw downvote count (8) is HIGHER
-- than the pin removed above (5), yet it is not removed, because enough
-- corroborating upvotes hold the margin below the threshold.
--
-- Order matters here and is deliberate, not incidental: the trigger's `and
-- not removed` guard (see the migration) is one-directional — once a pin is
-- marked removed, no later vote un-removes it, even if the tally the guard
-- would recompute has since fallen back under the threshold. Casting all 8
-- downvotes before any upvote would trip the threshold at the 5th downvote
-- (0 up / 5 down, margin 5) and lock the pin removed regardless of the 4
-- upvotes that arrive after — proving nothing about the margin this
-- assertion exists to check. Interleaving the votes so the running margin
-- (downs so far minus ups so far) never reaches 5 at any prefix is what
-- makes "8 down / 4 up, final margin 4" the state actually reached: down,
-- up, down, up, down, up, down, up (margin oscillates 1,0,1,0,1,0,1,0),
-- then four more downs straight (margin climbs 1,2,3,4, never 5).
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000001', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000009', 1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000002', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000010', 1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000003', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000011', 1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000004', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000012', 1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000005', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000006', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000007', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('88888888-8888-8888-8888-000000000002', '77777777-0000-0000-0000-000000000008', -1);

select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_row_count(
  'net-score trigger leaves a pin alone at 8 down / 4 up (margin 4, below the threshold)',
  $$select * from public.community_pins
    where id = '88888888-8888-8888-8888-000000000002'
      and removed = false$$,
  1);

-- Important 4, bullet 3: insert was tested, update was not. Reuses the
-- active 'red' alert on tests-fixture-zone from the uniqueness block above.
-- alerts_update_in_area's USING clause is manages_zone(zone_id), which is
-- false for a resident on every row, so — same reasoning again — no error, just
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

-- ---------------------------------------------------------------------------
-- Task 8, assertion 11: community_pins.removed is not in the authenticated
-- INSERT column grant (`grant insert (id, zone_id, status_tag, caption, lat,
-- lng, author_id)` — see 20260909080337_harden_community_grants.sql,
-- unchanged by the later widening in 20260909120345_task2_review_fixes.sql)
-- — so a resident cannot create a pin that is born already removed. This is
-- a genuinely different gate from the removed/removed_reason UPDATE trigger
-- exercised above (Important 2): that trigger only ever compares OLD vs NEW,
-- so it has nothing to say about INSERT, where there is no OLD row.
-- ---------------------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot insert a pin that is already removed',
  $$insert into public.community_pins (zone_id, status_tag, caption, lat, lng, author_id, removed)
    values ('tests-fixture-zone', 'passable', 'born-removed pin', 14.4, 121.4,
            '11111111-1111-1111-1111-111111111111', true)$$);

-- The pairing half, and also the "a resident CAN insert their own pin" case
-- that nothing else in this suite exercised directly (every earlier
-- community_pins fixture was inserted as postgres, bypassing RLS, to set up
-- state for other assertions): the very same insert, minus the offending
-- column, must succeed — otherwise the denial above would prove nothing
-- about which column the grant is refusing.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_allowed(
  'a resident CAN insert their own pin when removed is left to its default',
  $$insert into public.community_pins (zone_id, status_tag, caption, lat, lng, author_id)
    values ('tests-fixture-zone', 'passable', 'ordinary resident pin', 14.5, 121.5,
            '11111111-1111-1111-1111-111111111111')$$);

-- ---------------------------------------------------------------------------
-- Task 8, assertion 12: created_at/voted_at/checked_in_at are server clocks,
-- not client input. None of the three appears in its table's INSERT column
-- grant, so a client cannot backdate the record of when something happened
-- — the same column-grant shape that closed trust_weight/is_outlier
-- (Important 3, above) and community_pins.removed (assertion 11, above).
-- ---------------------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot backdate a pin''s created_at',
  $$insert into public.community_pins (zone_id, status_tag, caption, lat, lng, author_id, created_at)
    values ('tests-fixture-zone', 'passable', 'backdated pin', 14.6, 121.6,
            '11111111-1111-1111-1111-111111111111', now() - interval '30 days')$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot backdate a vote''s voted_at',
  $$insert into public.pin_votes (pin_id, voter_id, direction, voted_at)
    select id, '11111111-1111-1111-1111-111111111111', 1, now() - interval '30 days'
    from public.community_pins
    where author_id = '11111111-1111-1111-1111-111111111111' and caption = 'ordinary resident pin'$$);

-- checked_in_at is the one exception to assertion 12's "server clock, not
-- client input" rule, and deliberately so as of offline-sending Task 1 (see
-- the H-block near the end of this file): a queued check-in must keep the
-- time it was actually made, which can legitimately be hours in the past.
-- private.honest_check_in_time() (20260915143824_honest_write_times.sql,
-- bound added by 20260915150539_check_in_age_limit.sql) is what still
-- refuses a check-in's clock to be trusted blindly -- it clamps a future
-- timestamp to now(), refuses one more than 3 days old (raise exception
-- 'check-in too old' using errcode = '22023' -- fix round 1, task-1-review.md
-- finding 1: an unbounded backdate let a resident make their own live
-- needs_help check-in display as arbitrarily stale to officials), and, on
-- the upsert conflict path, never lets an older write regress a newer one.
-- Own zone (tests-fixture-zone-2, not tests-fixture-zone) so this fresh
-- (zone_id, user_id) pair cannot collide with the "check in when
-- checked_in_at is left to its default" assertion below, which inserts
-- (tests-fixture-zone, 11111111...) -- evacuation_check_ins is unique on
-- (zone_id, user_id).
--
-- Two cases, not a bare ALLOW that would pass for any value: within the
-- 3-day bound is honoured as sent; beyond it is refused. This pair is the
-- suite's coverage of that bound; the H-block below covers the check-in
-- trigger's other rules (future clamp, older-never-overwrites).
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_allowed(
  'a resident CAN backdate a check-in''s checked_in_at within the 3-day bound (offline-sending Task 1: the outbox keeps the time it was made)',
  $$insert into public.evacuation_check_ins (zone_id, user_id, status, checked_in_at)
    values ('tests-fixture-zone-2', '11111111-1111-1111-1111-111111111111', 'needs_help',
            now() - interval '2 days')$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_row_count(
  'the backdated check-in above actually kept its own time, not the time it landed',
  $$select * from public.evacuation_check_ins
    where zone_id = 'tests-fixture-zone-2' and user_id = '11111111-1111-1111-1111-111111111111'
      and status = 'needs_help'
      and checked_in_at between now() - interval '2 days 1 minute' and now() - interval '1 day 23 hours 59 minutes'$$,
  1);

-- Beyond the bound is refused, not silently honoured. Own zone
-- (tests-fixture-zone-3) so this attempted (and refused, hence never
-- landing) insert cannot be confused with the successful one just above.
-- tests.expect_denied only catches insufficient_privilege, so this is a
-- do-block in H4's style, catching sqlstate '22023' specifically.
insert into public.zones
  (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
values
  ('tests-fixture-zone-3', '000000004', 'Test Zone 3', '{"en":"x","fil":"x"}'::jsonb, 14.2, 121.2, '[]'::jsonb, '000');

do $$
declare
  v_sqlstate text;
  v_message text;
  v_raised boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

  begin
    insert into public.evacuation_check_ins (zone_id, user_id, status, checked_in_at)
      values ('tests-fixture-zone-3', '11111111-1111-1111-1111-111111111111', 'needs_help',
              now() - interval '30 days');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
  end;

  reset role;

  if not v_raised then
    raise exception using errcode = 'TSTFL',
      message = 'a resident backdating a check-in 30 days was accepted instead of refused';
  end if;
  if v_sqlstate is distinct from '22023' then
    raise exception using errcode = 'TSTFL',
      message = format('expected SQLSTATE 22023 for an over-old check-in, got %s (%s)', v_sqlstate, v_message);
  end if;
  if v_message !~ 'check-in too old' then
    raise exception using errcode = 'TSTFL',
      message = format('wrong error message for an over-old check-in: %s', v_message);
  end if;
  raise notice 'ok: a resident cannot backdate a check-in''s checked_in_at beyond the 3-day bound (22023, check-in too old)';
end $$;

-- The pairing half for assertion 12: the pin and vote inserts, minus their
-- backdated column, must still succeed -- otherwise the two denials above
-- (created_at, voted_at) would prove nothing about which column the grant
-- is refusing. checked_in_at no longer needs this pairing the same way
-- (the ALLOW case for it is the backdated insert just above, not an omitted
-- column), but the existing default-checked_in_at case right after still
-- covers the ordinary path where a resident sends no time at all.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_allowed(
  'a resident CAN vote on a pin when voted_at is left to its default',
  $$insert into public.pin_votes (pin_id, voter_id, direction)
    select id, '11111111-1111-1111-1111-111111111111', 1
    from public.community_pins
    where author_id = '11111111-1111-1111-1111-111111111111' and caption = 'ordinary resident pin'$$);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_allowed(
  'a resident CAN check in when checked_in_at is left to its default',
  $$insert into public.evacuation_check_ins (zone_id, user_id, status)
    values ('tests-fixture-zone', '11111111-1111-1111-1111-111111111111', 'safe')$$);

-- ---------------------------------------------------------------------------
-- Task 8, assertion 13: public.set_zone_alert is `security invoker` (see
-- supabase/migrations/20260910121053_set_zone_alert.sql) — deliberately, so
-- the UPDATE and INSERT inside its body run as the CALLING role and stay
-- subject to RLS rather than running as the function's owner. EXECUTE on the
-- function is granted to `authenticated` outright (residents included — the
-- operator gate lives in the alerts policies the function's body writes
-- through, not in who may call the function), so this is the one place in
-- the suite that proves invoker-vs-definer actually matters: if the
-- function were ever changed to `security definer`, the body would run as
-- its owner (postgres, which bypasses RLS), and a resident would be able to
-- issue alerts through the function even though assertion 1 (top of this
-- file) already proved they cannot issue one directly.
-- ---------------------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot use set_zone_alert to issue an alert (security invoker: RLS still applies inside it)',
  $$select public.set_zone_alert('tests-fixture-zone', 'orange', '{"en":"x","fil":"x"}'::jsonb)$$);

-- The pairing half: an operator calling the very same function supersedes
-- the zone's active alert and inserts the replacement, in one call.
-- tests-fixture-zone-2 already carries an active 'red' alert from the
-- operator-insert assertion (Critical 1) earlier in this file.
select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_allowed(
  'an operator CAN use set_zone_alert to supersede the active alert and issue the new one',
  $$select public.set_zone_alert('tests-fixture-zone-2', 'orange', '{"en":"y","fil":"y"}'::jsonb)$$);

select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_row_count(
  'set_zone_alert left exactly one active alert on the zone, at the new severity',
  $$select * from public.alerts
    where zone_id = 'tests-fixture-zone-2' and is_active and severity = 'orange'$$,
  1);

select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_row_count(
  'set_zone_alert superseded the previous alert rather than leaving it active',
  $$select * from public.alerts
    where zone_id = 'tests-fixture-zone-2' and severity = 'red' and not is_active
      and superseded_at is not null$$,
  1);

-- ---------------------------------------------------------------------------
-- Task 8, assertion 14: evacuation_centers.current_occupancy is operator-
-- written through centers_update_in_area, whose USING/WITH CHECK is
-- manages_zone(zone_id) — same shape as the zones/alerts unchanged-value assertions
-- above, so a resident's UPDATE matches zero rows silently rather than
-- raising. current_occupancy IS in the authenticated UPDATE column grant
-- (`grant update (status, current_occupancy)` — see
-- 20260909120345_task2_review_fixes.sql), so this is purely an RLS
-- assertion, not a grant one: the column-grant gate would let this through,
-- the policy is what actually stops it.
-- ---------------------------------------------------------------------------
insert into public.evacuation_centers (id, zone_id, name, lat, lng, capacity, status, current_occupancy)
values ('tests-fixture-center', 'tests-fixture-zone', 'Test Center', 14.0, 121.0, 100, 'space_available', 10);

do $$
declare
  original int;
  observed int;
begin
  select current_occupancy into original from public.evacuation_centers where id = 'tests-fixture-center';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

  begin
    update public.evacuation_centers set current_occupancy = 999
      where id = 'tests-fixture-center';
  exception when insufficient_privilege then
    -- Not expected today (the grant does allow this column) -- caught
    -- anyway so a future narrowing of the grant strengthens this test
    -- instead of aborting the suite, matching the pattern used throughout
    -- this file (e.g. the zones/alerts unchanged-value blocks above).
    raise notice 'ok: evacuation_centers UPDATE refused outright (grant narrowed), not merely filtered';
  end;

  reset role;

  select current_occupancy into observed from public.evacuation_centers where id = 'tests-fixture-center';

  if observed is distinct from original then
    raise exception using errcode = 'TSTFL',
      message = 'SECURITY TEST FAILED — resident updated evacuation_centers.current_occupancy';
  end if;
  raise notice 'ok: resident cannot update evacuation_centers.current_occupancy (unchanged, update matched zero rows)';
end $$;

select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_allowed(
  'an operator CAN update evacuation_centers.current_occupancy',
  $$update public.evacuation_centers set current_occupancy = 55
    where id = 'tests-fixture-center'$$);

select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_row_count(
  'the operator''s occupancy update above actually landed',
  $$select * from public.evacuation_centers where id = 'tests-fixture-center' and current_occupancy = 55$$,
  1);

-- ===========================================================================
-- Task 1 (officials-and-roles): area limits. Every official is limited, by
-- the database, to their own area, expressed as a prefix of the national
-- PSGC barangay code. Town 0199901 has barangays a1 and a2; town 0199902 has
-- b1. Fixtures use real-shaped 10-digit codes so private.manages_zone's
-- prefix match exercises the actual rule, not a coincidence of short codes.
-- ===========================================================================

insert into public.zones
  (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
values
  ('tests-area-a1', '0199901001', 'Barangay Uno, Testtown',  '{"en":"x","fil":"x"}'::jsonb, 14.0, 121.0, '[]'::jsonb, '000'),
  ('tests-area-a2', '0199901002', 'Barangay Dos, Testtown',  '{"en":"x","fil":"x"}'::jsonb, 14.0, 121.0, '[]'::jsonb, '000'),
  ('tests-area-b1', '0199902001', 'Barangay Tres, Othertown','{"en":"x","fil":"x"}'::jsonb, 14.0, 121.0, '[]'::jsonb, '000');

insert into public.evacuation_centers (id, zone_id, name, lat, lng, capacity)
values ('tests-centre-a1', 'tests-area-a1', 'C a1', 14.0, 121.0, 100),
       ('tests-centre-a2', 'tests-area-a2', 'C a2', 14.0, 121.0, 100);

-- Users:
--   '44444444-4444-4444-4444-444444444444'  barangay official for a1  (area '0199901001')
--   '55555555-5555-5555-5555-555555555555'  municipal official for Testtown (area '0199901')
--   '66666666-6666-6666-6666-666666666666'  resident -- reuses the net-score-fixture
--                                             author already inserted into auth.users
--                                             earlier in this file (still role
--                                             'resident', never promoted), so it is not
--                                             re-inserted here.
insert into auth.users (id) values
  ('44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555');

update public.profiles set role='operator', area_code='0199901001', display_name='Official A1'
 where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set role='operator', area_code='0199901', display_name='Official Testtown'
 where id = '55555555-5555-5555-5555-555555555555';

-- A1: a1 official raises an alert in their own barangay.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'A1: a1 official CAN set an alert in their own barangay',
  $$select public.set_zone_alert('tests-area-a1', 'red', '{"en":"x","fil":"x"}'::jsonb)$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'A1: exactly one active alert now on a1',
  $$select * from public.alerts where zone_id = 'tests-area-a1' and is_active$$,
  1);

-- A2: the same official cannot touch a2, a different barangay in the same town.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_denied(
  'A2: a1 official CANNOT set an alert in a2 (same town, different barangay)',
  $$select public.set_zone_alert('tests-area-a2', 'red', '{"en":"x","fil":"x"}'::jsonb)$$);

-- A3: the municipal official covers every barangay in their town, including a2.
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_allowed(
  'A3: Testtown official CAN set an alert in a2 (covers the whole town)',
  $$select public.set_zone_alert('tests-area-a2', 'red', '{"en":"x","fil":"x"}'::jsonb)$$);

select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_row_count(
  'A3: exactly one active alert now on a2',
  $$select * from public.alerts where zone_id = 'tests-area-a2' and is_active$$,
  1);

-- A4: the municipal official's coverage stops at the town boundary.
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_denied(
  'A4: Testtown official CANNOT set an alert in b1 (a different town)',
  $$select public.set_zone_alert('tests-area-b1', 'red', '{"en":"x","fil":"x"}'::jsonb)$$);

-- A5: an official in their own area still cannot forge an automatic-source alert.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_denied(
  'A5: a1 official CANNOT insert an alert with source auto_crowdsourced, even in their own barangay',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('tests-area-a1', 'red', '{"en":"x","fil":"x"}'::jsonb, 'auto_crowdsourced')$$);

-- A6 setup: clear a1's alert first -- only one active alert per zone is
-- allowed, and this clear is itself a legitimate in-area action (the a1
-- official managing their own zone).
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'A6 setup: a1 official clears a1''s alert so the manual insert below does not collide with the one-active-alert constraint',
  $$select public.set_zone_alert('tests-area-a1', null, null)$$);

-- A6: with source = 'manual' and no collision, the same insert shape succeeds.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'A6: a1 official CAN insert an alert with source manual in their own barangay',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('tests-area-a1', 'red', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

-- A7: a1 official cannot clear a2's active alert (set by the Testtown official
-- in A3) -- and this must be a genuine 42501 raised by set_zone_alert's own
-- check, not a silent no-op the caller would read as success.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_denied(
  'A7: a1 official CANNOT clear a2''s active alert (42501, not a silent no-op)',
  $$select public.set_zone_alert('tests-area-a2', null, null)$$);

-- A8: a1 official clears a1's own alert (the one inserted in A6).
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'A8: a1 official CAN clear a1''s own alert',
  $$select public.set_zone_alert('tests-area-a1', null, null)$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'A8: no active alert remains on a1',
  $$select * from public.alerts where zone_id = 'tests-area-a1' and is_active$$,
  0);

-- A9: a1 official can update their own barangay's evacuation centre.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'A9: a1 official CAN update evacuation_centers.current_occupancy for centre-a1',
  $$update public.evacuation_centers set current_occupancy = 10 where id = 'tests-centre-a1'$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'A9: the occupancy update on centre-a1 actually landed',
  $$select * from public.evacuation_centers where id = 'tests-centre-a1' and current_occupancy = 10$$,
  1);

-- A10: the same official cannot touch centre-a2's occupancy. RLS filters this
-- to zero rows silently (no exception) -- same shape as the zones/alerts
-- unchanged-value blocks earlier in this file, so it is proven the same way:
-- a manual role switch, a raw UPDATE, and an unchanged-value check.
do $$
declare
  original int;
  observed int;
begin
  select current_occupancy into original from public.evacuation_centers where id = 'tests-centre-a2';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

  update public.evacuation_centers set current_occupancy = 10 where id = 'tests-centre-a2';

  reset role;

  select current_occupancy into observed from public.evacuation_centers where id = 'tests-centre-a2';

  if observed is distinct from original then
    raise exception using errcode = 'TSTFL',
      message = 'SECURITY TEST FAILED — A10: a1 official updated centre-a2''s occupancy (outside their area)';
  end if;
  raise notice 'ok, row count 0: A10 a1 official cannot update centre-a2''s occupancy (unchanged, update matched zero rows)';
end $$;

-- A11: a resident can still check in anywhere -- the area rule is for
-- officials, not for a resident's own check-in.
select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_allowed(
  'A11: a resident CAN check in at a2',
  $$insert into public.evacuation_check_ins (zone_id, user_id, status)
    values ('tests-area-a2', '66666666-6666-6666-6666-666666666666', 'safe')$$);

-- A12: a1 official cannot read a2's check-ins -- a2 is outside their
-- barangay-level area.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'A12: a1 official cannot see check-ins in a2',
  $$select * from public.evacuation_check_ins where zone_id = 'tests-area-a2'$$,
  0);

-- A13: the Testtown official covers a2, so they can.
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_row_count(
  'A13: Testtown official CAN see check-ins in a2',
  $$select * from public.evacuation_check_ins where zone_id = 'tests-area-a2'$$,
  1);

-- A14/A15: restoring a removed pin. Fixture: a pin in a2, owned by the
-- resident, already removed by an admin decision -- inserted as postgres
-- (bypassing RLS) because `removed` is not in the authenticated INSERT
-- column grant on community_pins (see Task 8's assertion 11, above in this
-- file).
insert into public.community_pins (id, zone_id, status_tag, caption, lat, lng, author_id, removed, removed_reason)
values ('99999999-0000-0000-0000-000000000001', 'tests-area-a2', 'flooded', 'area test fixture pin', 14.0, 121.0,
        '66666666-6666-6666-6666-666666666666', true, 'admin');

-- A14: a1 official cannot restore it -- neither the pin's author nor a
-- manager of a2's zone, so pins_update_own_or_in_area's USING clause filters
-- the row out of the UPDATE entirely. The moderation trigger never even
-- fires (it only sees rows RLS lets through the UPDATE's target set), so
-- this is a silent zero-row filter, not a raised exception -- proven the
-- same way as A10.
do $$
declare
  original_removed boolean;
  observed_removed boolean;
begin
  select removed into original_removed from public.community_pins where id = '99999999-0000-0000-0000-000000000001';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

  update public.community_pins set removed = false, removed_reason = null
    where id = '99999999-0000-0000-0000-000000000001';

  reset role;

  select removed into observed_removed from public.community_pins where id = '99999999-0000-0000-0000-000000000001';

  if observed_removed is distinct from original_removed then
    raise exception using errcode = 'TSTFL',
      message = 'SECURITY TEST FAILED — A14: a1 official restored a2''s pin (outside their area)';
  end if;
  raise notice 'ok, row count 0: A14 a1 official cannot restore a2''s pin (unchanged, update matched zero rows)';
end $$;

-- A15: the Testtown official manages a2, so they can restore it. Reaching
-- pins_update_own_or_in_area's USING clause this time means the moderation
-- trigger DOES fire, and its WHEN clause (not private.manages_zone(new.zone_id))
-- is false for this caller, so it does not raise.
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_allowed(
  'A15: Testtown official CAN restore a2''s pin',
  $$update public.community_pins set removed = false, removed_reason = null
    where id = '99999999-0000-0000-0000-000000000001'$$);

select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_row_count(
  'A15: the restore above actually landed',
  $$select * from public.community_pins where id = '99999999-0000-0000-0000-000000000001' and removed = false and removed_reason is null$$,
  1);

-- A16: no client, official or resident, has an UPDATE grant on profiles at
-- all. A resident cannot grant themselves an area, a role or a name.
select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_denied(
  'A16: a resident cannot set their own area_code',
  $$update public.profiles set area_code = '0199901' where id = '66666666-6666-6666-6666-666666666666'$$);

select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_denied(
  'A16: a resident cannot set their own role to operator',
  $$update public.profiles set role = 'operator' where id = '66666666-6666-6666-6666-666666666666'$$);

select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_denied(
  'A16: a resident cannot set their own display_name',
  $$update public.profiles set display_name = 'x' where id = '66666666-6666-6666-6666-666666666666'$$);

-- A17: profiles_read_own drops the old "or operator" clause -- an official
-- can no longer read another user's profile, including another official's.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'A17: a1 official cannot read the Testtown official''s profile (own row only)',
  $$select * from public.profiles where id = '55555555-5555-5555-5555-555555555555'$$,
  0);

-- A18: municipalities is reference data, world-readable including anon.
select tests.as_anon();
select tests.expect_allowed(
  'A18: anon CAN read municipalities',
  $$select * from public.municipalities$$);

-- A19: municipalities is never client-writable, not even by an official.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_denied(
  'A19: an official cannot insert a municipality',
  $$insert into public.municipalities (code, name) values ('0199903', 'X')$$);

-- ===========================================================================
-- Task 2 (officials-and-roles): the action record. Every official action is
-- written by database triggers into an append-only public.official_actions
-- log, so the app can always say who issued an alert. Reuses Task 1's
-- fixture zones (tests-area-a1 '0199901001', tests-area-a2 '0199901002'),
-- centre tests-centre-a1, and officials 44444444... (Official A1, area
-- '0199901001') / 55555555... (Official Testtown, area '0199901').
--
-- R6 ruling: by this point Task 1's block above has already performed
-- several alert.set inserts on tests-area-a1 (recorded immediately by the
-- plain AFTER INSERT trigger) and TWO
-- set_zone_alert('tests-area-a1', null, null) clears (A6 setup and A8),
-- whose DEFERRED alerts_record_cleared triggers are still pending -- they
-- have not fired yet because this suite never commits. Materialise them now
-- and wipe the slate (as the owner -- only the owner can delete, which is
-- correct and does not weaken R10-R12 below: append-only is a grant-level
-- property against clients, not against the table owner), so R1 onward
-- starts from a clean, known state instead of R2's own
-- `set constraints all immediate` also firing these two leftover events and
-- corrupting R2/R3's counts.
-- ===========================================================================

reset role;
select set_config('request.jwt.claims', '', true);
set constraints all immediate;
set constraints all deferred;
delete from public.official_actions;

-- R1: a1 official sets a1 to red (a1 currently has no active alert -- A8
-- cleared it). Exactly one alert.set row, from null, to red, credited to
-- Official A1 / area 0199901001.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'R1 setup: a1 official sets a1 to red',
  $$select public.set_zone_alert('tests-area-a1', 'red', '{"en":"x","fil":"x"}'::jsonb)$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R1: exactly one alert.set row for a1 (red, from null, Official A1 / 0199901001)',
  $$select * from public.official_actions
    where action = 'alert.set' and zone_id = 'tests-area-a1'
      and detail->>'from' is null and detail->>'to' = 'red'
      and actor_name = 'Official A1' and actor_area = '0199901001'$$,
  1);

-- R2: lowering severity (not clearing) must record exactly one new alert.set
-- row and NO alert.cleared row. `set constraints all immediate` forces the
-- deferred trigger queued by the UPDATE inside set_zone_alert to run now, so
-- its guard (an active alert already exists -- the just-inserted yellow one)
-- can be observed within this transaction instead of vacuously passing at
-- commit (which never happens -- the suite rolls back).
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'R2 setup: a1 official lowers a1 to yellow',
  $$select public.set_zone_alert('tests-area-a1', 'yellow', '{"en":"x","fil":"x"}'::jsonb)$$);
set constraints all immediate;
set constraints all deferred;

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R2: exactly one new alert.set row (red to yellow)',
  $$select * from public.official_actions
    where action = 'alert.set' and zone_id = 'tests-area-a1'
      and detail->>'from' = 'red' and detail->>'to' = 'yellow'$$,
  1);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R2: no alert.cleared row when a1''s severity is only lowered, not cleared',
  $$select * from public.official_actions
    where action = 'alert.cleared' and zone_id = 'tests-area-a1'$$,
  0);

-- R3: actually clearing a1 (severity down to null) DOES record an
-- alert.cleared row, once the deferred trigger is forced to run.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'R3 setup: a1 official clears a1',
  $$select public.set_zone_alert('tests-area-a1', null, null)$$);
set constraints all immediate;
set constraints all deferred;

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R3: exactly one alert.cleared row (from yellow)',
  $$select * from public.official_actions
    where action = 'alert.cleared' and zone_id = 'tests-area-a1'
      and detail->>'from' = 'yellow'$$,
  1);

-- R4: a change to the centre's status alone records one centre.status row.
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'R4 setup: a1 official changes tests-centre-a1''s status',
  $$update public.evacuation_centers set status = 'full' where id = 'tests-centre-a1'$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R4: one centre.status row (space_available to full)',
  $$select * from public.official_actions
    where action = 'centre.status' and target_id = 'tests-centre-a1'
      and detail->>'from' = 'space_available' and detail->>'to' = 'full'$$,
  1);

-- R5: a change to the centre's occupancy alone records one centre.occupancy
-- row. tests-centre-a1's occupancy is 10 going in (Task 1's A9).
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'R5 setup: a1 official changes tests-centre-a1''s occupancy',
  $$update public.evacuation_centers set current_occupancy = 42 where id = 'tests-centre-a1'$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R5: one centre.occupancy row (10 to 42)',
  $$select * from public.official_actions
    where action = 'centre.occupancy' and target_id = 'tests-centre-a1'
      and detail->>'from' = '10' and detail->>'to' = '42'$$,
  1);

-- R6: an admin removal of a pin in a1 by the a1 official.
insert into public.community_pins (id, zone_id, status_tag, caption, lat, lng, author_id)
values ('99999999-0000-0000-0000-000000000002', 'tests-area-a1', 'flooded',
        'R6 fixture pin (admin removal)', 14.0, 121.0, '66666666-6666-6666-6666-666666666666');

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed(
  'R6 setup: a1 official removes a pin in a1 for admin reasons',
  $$update public.community_pins set removed = true, removed_reason = 'admin'
    where id = '99999999-0000-0000-0000-000000000002'$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R6: one pin.removed row, reason admin, credited to Official A1',
  $$select * from public.official_actions
    where action = 'pin.removed' and target_id = '99999999-0000-0000-0000-000000000002'
      and detail->>'reason' = 'admin' and actor_name = 'Official A1'$$,
  1);

-- R7: the pin's own author withdrawing it (removed_reason left null) is not
-- an official action -- no row at all. Checked by an official (who can read
-- every area's rows, per R14) rather than the withdrawing resident, since
-- R13 shows a resident can never read official_actions regardless of what
-- exists.
insert into public.community_pins (id, zone_id, status_tag, caption, lat, lng, author_id)
values ('99999999-0000-0000-0000-000000000003', 'tests-area-a1', 'flooded',
        'R7 fixture pin (self-withdrawal)', 14.0, 121.0, '66666666-6666-6666-6666-666666666666');

select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_allowed(
  'R7 setup: the pin''s author withdraws their own pin',
  $$update public.community_pins set removed = true where id = '99999999-0000-0000-0000-000000000003'$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R7: no official_actions row for a self-withdrawal',
  $$select * from public.official_actions where target_id = '99999999-0000-0000-0000-000000000003'$$,
  0);

-- R8: a fresh net-score removal (same 5-down/0-up margin-5 shape as the
-- pin_votes_apply_net_score_removal fixture earlier in this file, on a new
-- pin so its own trigger fires inside this block). Credited to
-- 'Automatic — net score' with no human actor -- never the voter who tipped
-- the threshold.
insert into public.community_pins (id, zone_id, status_tag, caption, lat, lng, author_id)
values ('99999999-0000-0000-0000-000000000004', 'tests-area-a1', 'flooded',
        'R8 fixture pin (net-score removal)', 14.0, 121.0, '66666666-6666-6666-6666-666666666666');

insert into public.pin_votes (pin_id, voter_id, direction) values ('99999999-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000001', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('99999999-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000002', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('99999999-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000003', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('99999999-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000004', -1);
insert into public.pin_votes (pin_id, voter_id, direction) values ('99999999-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000005', -1);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R8: net-score removal credited to Automatic — net score, no actor_id (not the voter)',
  $$select * from public.official_actions
    where action = 'pin.removed' and target_id = '99999999-0000-0000-0000-000000000004'
      and actor_name = 'Automatic — net score' and actor_id is null$$,
  1);

-- R9: an automatic alert set as the owner (no impersonation) must credit
-- 'Automatic — <source>', never the last-impersonated user. Reset role AND
-- clear the JWT claims first -- auth.uid() reads a per-transaction GUC, not
-- the role, so leaving the claims in place from R8's impersonation would
-- otherwise credit this to whichever user tests.as_user last set.
reset role;
select set_config('request.jwt.claims', '', true);
select public.set_zone_alert('tests-area-a2', 'orange', '{"en":"x","fil":"x"}'::jsonb, 'auto_crowdsourced');

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_row_count(
  'R9: one alert.set row on a2 credited to Automatic — auto_crowdsourced',
  $$select * from public.official_actions
    where action = 'alert.set' and zone_id = 'tests-area-a2'
      and actor_name = 'Automatic — auto_crowdsourced'$$,
  1);

-- R10-R12: official_actions is append-only against every client -- no
-- client, official or not, can write to it at all. private.record_official_action
-- is the sole writer, and it is not reachable by authenticated (EXECUTE
-- revoked from public/anon/authenticated).
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_denied(
  'R10: an official cannot INSERT into official_actions directly',
  $$insert into public.official_actions (actor_name, action) values ('x', 'alert.set')$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_denied(
  'R11: an official cannot UPDATE official_actions (no UPDATE grant -- raises, does not just filter)',
  $$update public.official_actions set actor_name = 'x'$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_denied(
  'R12: an official cannot DELETE from official_actions',
  $$delete from public.official_actions$$);

-- R13: a resident reads nothing from official_actions -- residents never see
-- officials' names or the action record.
select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_row_count(
  'R13: a resident sees no official_actions rows',
  $$select * from public.official_actions$$,
  0);

-- R14: every official reads every area's rows -- official_actions_read is
-- gated on is_operator(), not manages_zone(). The Testtown official sees at
-- least one row overall, including a1's entries, even though the read
-- policy has no per-zone check at all.
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_row_count(
  'R14: Testtown official sees at least one official_actions row',
  $$select 1 from public.official_actions limit 1$$,
  1);

select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_row_count(
  'R14: Testtown official sees a1''s entries too (every official reads every area)',
  $$select 1 from public.official_actions where zone_id = 'tests-area-a1' limit 1$$,
  1);

-- ===========================================================================
-- Task 3 (officials-and-roles): appointment commands. The system owner
-- appoints and removes officials by running private.appoint_official and
-- private.remove_official directly in the SQL editor, signed in as no one --
-- private.record_official_action then credits every action to 'System
-- owner'. Reuses Task 1's fixture zones (tests-area-a1 '0199901001' and
-- tests-area-a2 '0199901002', both "Barangay ..., Testtown"; tests-area-b1
-- '0199902001', "Barangay Tres, Othertown").
--
-- R1 ruling: neither Task 1 nor Task 2 ever inserts a municipalities row for
-- the fixture towns, so a by-town-name lookup here would otherwise raise
-- "No town named" immediately (P1/P2 would fail before ever exercising the
-- functions under test). This block inserts Testtown's and Othertown's
-- municipality rows before P1. P4 below then inserts a SECOND row also
-- named 'Testtown' with a different code, deliberately creating the
-- ambiguity it tests -- 'Testtown' stays ambiguous for every statement
-- after P4, and no assertion after P4 relies on resolving that bare name.
-- ===========================================================================

insert into public.municipalities (code, name) values
  ('0199901', 'Testtown'),
  ('0199902', 'Othertown');

-- Fixture users:
--   88888888-... has an email and is_anonymous = false -- the account
--   P1/P2/P5/P6/P7/P9 appoint, re-appoint, remove and re-check.
--   99999999-... is anonymous (is_anonymous = true, no email) -- an
--   ordinary signed-in resident, standing in for "any authenticated
--   caller" in P8.
-- email_confirmed_at is set because appoint_official refuses an address
-- the person has not confirmed (M6; see the M6 block at the end of this file).
insert into auth.users (id, email, email_confirmed_at) values
  ('88888888-8888-8888-8888-888888888888', 'official.test@example.com', now());
insert into auth.users (id, is_anonymous) values
  ('99999999-9999-9999-9999-999999999999', true);

-- P1: appoint by "<Barangay>, <Town>" -- matches zone tests-area-a1
-- ("Barangay Uno, Testtown") only, so coverage is exactly a1's barangay.
do $$
declare
  v_result text;
begin
  select private.appoint_official('official.test@example.com', 'Uno, Testtown', 'Test Official')
    into v_result;
  if v_result !~ 'covers 1 barangay' then
    raise exception using errcode = 'TSTFL', message = format(
      'TEST FAILED — P1: expected result to contain ''covers 1 barangay'', got: %s', v_result);
  end if;
  raise notice 'ok, P1: appoint_official(''Uno, Testtown'') returned: %', v_result;
end $$;

do $$
declare
  v_role text;
  v_area text;
begin
  select role, area_code into v_role, v_area
    from public.profiles where id = '88888888-8888-8888-8888-888888888888';
  if v_role is distinct from 'operator' or v_area is distinct from '0199901001' then
    raise exception using errcode = 'TSTFL', message = format(
      'TEST FAILED — P1: expected role=operator area_code=0199901001, got role=%s area_code=%s',
      v_role, v_area);
  end if;
  raise notice 'ok, P1: profile is operator with area_code 0199901001';
end $$;

-- P2: appoint by bare town name -- matches municipalities row Testtown
-- (0199901) only (P4 has not yet introduced the second one), covering both
-- of Testtown's barangays (a1 and a2).
do $$
declare
  v_result text;
begin
  select private.appoint_official('official.test@example.com', 'Testtown', 'Test Official')
    into v_result;
  if v_result !~ 'covers 2 barangay' then
    raise exception using errcode = 'TSTFL', message = format(
      'TEST FAILED — P2: expected result to contain ''covers 2 barangay'', got: %s', v_result);
  end if;
  raise notice 'ok, P2: appoint_official(''Testtown'') returned: %', v_result;
end $$;

do $$
declare
  v_area text;
begin
  select area_code into v_area
    from public.profiles where id = '88888888-8888-8888-8888-888888888888';
  if v_area is distinct from '0199901' then
    raise exception using errcode = 'TSTFL', message = format(
      'TEST FAILED — P2: expected area_code=0199901, got %s', v_area);
  end if;
  raise notice 'ok, P2: profile area_code is 0199901';
end $$;

-- P3: an email with no account at all.
do $$
declare
  v_result text;
  v_raised boolean := false;
begin
  begin
    select private.appoint_official('no.such.user@example.com', 'Testtown', 'X') into v_result;
  exception
    when others then
      v_raised := true;
      if sqlerrm !~ 'sign in once first' then
        raise exception using errcode = 'TSTFL', message = format(
          'TEST FAILED — P3: wrong exception message, got: %s', sqlerrm);
      end if;
  end;
  if not v_raised then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — P3: expected an exception for an email with no account, succeeded instead';
  end if;
  raise notice 'ok, P3: appoint_official raised for an unknown email';
end $$;

-- P4: a second municipalities row named 'Testtown', creating a genuine name
-- collision. From here on, 'Testtown' resolves to two different codes -- no
-- assertion after this point relies on resolving that bare name.
insert into public.municipalities (code, name) values ('0199903', 'Testtown');

do $$
declare
  v_result text;
  v_raised boolean := false;
begin
  begin
    select private.appoint_official('official.test@example.com', 'Testtown', 'X') into v_result;
  exception
    when others then
      v_raised := true;
      if sqlerrm !~ '0199901' or sqlerrm !~ '0199903' then
        raise exception using errcode = 'TSTFL', message = format(
          'TEST FAILED — P4: expected message to list both codes 0199901 and 0199903, got: %s', sqlerrm);
      end if;
  end;
  if not v_raised then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — P4: expected an exception for an ambiguous town name, succeeded instead';
  end if;
  raise notice 'ok, P4: appoint_official raised for ambiguous ''Testtown'', listing both codes';
end $$;

-- P5: a 7-digit code is the documented escape hatch for a name that is
-- ambiguous -- unaffected by P4's ambiguity, since it never looks the name
-- up at all.
do $$
declare
  v_result text;
begin
  select private.appoint_official('official.test@example.com', '0199902', 'Test Official') into v_result;
  raise notice 'ok, P5: appoint_official(''0199902'') returned: %', v_result;
end $$;

do $$
declare
  v_area text;
begin
  select area_code into v_area
    from public.profiles where id = '88888888-8888-8888-8888-888888888888';
  if v_area is distinct from '0199902' then
    raise exception using errcode = 'TSTFL', message = format(
      'TEST FAILED — P5: expected area_code=0199902, got %s', v_area);
  end if;
  raise notice 'ok, P5: profile area_code is 0199902';
end $$;

-- P6: remove the official -- role, area and name all clear together, or
-- operator_has_area_and_name would reject the write.
do $$
declare
  v_result text;
begin
  select private.remove_official('official.test@example.com') into v_result;
  raise notice 'ok, P6: remove_official returned: %', v_result;
end $$;

do $$
declare
  v_role text;
  v_area text;
  v_name text;
begin
  select role, area_code, display_name into v_role, v_area, v_name
    from public.profiles where id = '88888888-8888-8888-8888-888888888888';
  if v_role is distinct from 'resident' or v_area is not null or v_name is not null then
    raise exception using errcode = 'TSTFL', message = format(
      'TEST FAILED — P6: expected role=resident area_code=null display_name=null, got role=%s area_code=%s display_name=%s',
      v_role, v_area, v_name);
  end if;
  raise notice 'ok, P6: profile is resident with null area and name';
end $$;

-- P7: P1, P2 and P6 each wrote exactly one official_actions row, credited
-- to 'System owner' (no signed-in user issued any of these). P5 is a
-- successful appoint_official call too (the escape-hatch code), so it
-- necessarily adds a third official.appointed row of its own -- the count
-- below is 3 (P1 + P2 + P5), not 2, to match what actually happened rather
-- than silently dropping P5's own write from the check.
do $$
declare
  v_appointed int;
  v_removed int;
begin
  select count(*) into v_appointed from public.official_actions
    where action = 'official.appointed' and actor_name = 'System owner'
      and target_id = '88888888-8888-8888-8888-888888888888';
  if v_appointed <> 3 then
    raise exception using errcode = 'TSTFL', message = format(
      'TEST FAILED — P7: expected 3 official.appointed rows (P1 + P2 + P5) credited to System owner, got %s', v_appointed);
  end if;

  select count(*) into v_removed from public.official_actions
    where action = 'official.removed' and actor_name = 'System owner'
      and target_id = '88888888-8888-8888-8888-888888888888';
  if v_removed <> 1 then
    raise exception using errcode = 'TSTFL', message = format(
      'TEST FAILED — P7: expected 1 official.removed row (P6) credited to System owner, got %s', v_removed);
  end if;
  raise notice 'ok, P7: P1, P2, P5 and P6 each wrote an official_actions row credited to System owner';
end $$;

-- P8: both functions are owner-only. Calling private.appoint_official as
-- authenticated is denied here too -- but authenticated also has no USAGE
-- on schema private at all (unrelated to this task, never granted), so
-- that denial alone would fire identically whether or not EXECUTE is
-- revoked, and would not actually prove this task's own revoke. Checked
-- directly against the catalog as well, which is what actually flips if
-- the revoke is missing.
select tests.as_user('99999999-9999-9999-9999-999999999999');
select tests.expect_denied(
  'P8: an authenticated caller cannot call appoint_official',
  $$select private.appoint_official('x@example.com', 'Testtown', 'X')$$);

do $$
begin
  if has_function_privilege('authenticated', 'private.appoint_official(text,text,text)', 'EXECUTE') then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — P8: authenticated has EXECUTE on private.appoint_official';
  end if;
  if has_function_privilege('anon', 'private.appoint_official(text,text,text)', 'EXECUTE') then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — P8: anon has EXECUTE on private.appoint_official';
  end if;
  if has_function_privilege('authenticated', 'private.remove_official(text)', 'EXECUTE') then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — P8: authenticated has EXECUTE on private.remove_official';
  end if;
  if has_function_privilege('anon', 'private.remove_official(text)', 'EXECUTE') then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — P8: anon has EXECUTE on private.remove_official';
  end if;
  raise notice 'ok, P8: EXECUTE on appoint_official and remove_official is revoked from anon and authenticated';
end $$;

-- P9: removal takes effect on the very next statement -- no cache, no
-- delay. The removed user (same auth.users row, still is_anonymous = false)
-- is a resident again, so is_operator() is false and set_zone_alert's own
-- RLS-backed check refuses them.
select tests.as_user('88888888-8888-8888-8888-888888888888');
select tests.expect_denied(
  'P9: the removed official cannot set an alert on the very next statement',
  $$select public.set_zone_alert('tests-area-a1', 'red', '{"en":"x","fil":"x"}'::jsonb)$$);

-- ===========================================================================
-- P5-b (parked finding, officials-and-roles): psgc_barangay_code is the
-- actual permission boundary private.manages_zone enforces (a prefix match
-- against it decides who may act on a zone), and
-- src/lib/auth/load-official.ts looks a zone up by it with .maybeSingle(),
-- which throws if two zones ever share a code. There was no UNIQUE
-- constraint stopping that. This proves the database itself now refuses a
-- duplicate, regardless of role -- run as postgres (bypassing RLS, exactly
-- like the one-active-alert-per-zone and one-vote-per-pin blocks earlier in
-- this file) because a UNIQUE constraint is not a policy, so
-- tests.expect_denied (which only catches insufficient_privilege) cannot
-- express this; the expected exception is unique_violation.
-- '0105528012' is the seeded live code for zone-1 (Barangay Nilombot,
-- Mapandan) -- a real row already in the table this suite runs against, not
-- a fixture inserted above.
-- ===========================================================================
do $$
begin
  set local role postgres;
  begin
    insert into public.zones
      (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
    values
      ('tests-fixture-dup-zone', '0105528012', 'Duplicate Code Zone', '{"en":"x","fil":"x"}'::jsonb, 0, 0, '[]'::jsonb, '000');
    raise exception using errcode = 'TSTFL',
      message = 'P5-b: a duplicate psgc_barangay_code was allowed onto two zones';
  exception
    when unique_violation then raise notice 'ok, P5-b: zones_psgc_barangay_code_key refuses a duplicate psgc_barangay_code';
  end;
  reset role;
end $$;


-- ===========================================================================
-- Final-review hardening (M6, M8).
--
-- M6a: appoint_official refuses an account whose email is not confirmed.
-- Safe today only because email autoconfirm is off; if it were ever turned on,
-- anyone could pre-register an official's address and be appointed in their
-- place. Run as postgres, the owner, the way the system owner runs it.
-- ===========================================================================
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'unconfirmed.test@example.com');

do $$
declare
  v_result text;
  v_raised boolean := false;
begin
  begin
    select private.appoint_official('unconfirmed.test@example.com', '0199902', 'Unconfirmed Person') into v_result;
  exception
    when others then
      v_raised := true;
      if sqlerrm !~ 'finish signing in' then
        raise exception using errcode = 'TSTFL', message = format(
          'TEST FAILED — M6a: wrong exception message, got: %s', sqlerrm);
      end if;
  end;
  if not v_raised then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — M6a: appointing an unconfirmed email succeeded instead of raising';
  end if;
  if exists (select 1 from public.profiles
              where id = 'aaaaaaaa-0000-0000-0000-00000000000a' and role = 'operator') then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — M6a: the unconfirmed account was made an operator';
  end if;
  raise notice 'ok, M6a: appoint_official raised for an unconfirmed email';
end $$;

-- M6b: appoint_official refuses when the matched user has no profiles row,
-- rather than echoing success and recording official.appointed for an
-- update that changed nothing.
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'noprofile.test@example.com', now());
delete from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000b';

do $$
declare
  v_result text;
  v_raised boolean := false;
begin
  begin
    select private.appoint_official('noprofile.test@example.com', '0199902', 'No Profile Person') into v_result;
  exception
    when others then
      v_raised := true;
      if sqlerrm !~ 'no profile' then
        raise exception using errcode = 'TSTFL', message = format(
          'TEST FAILED — M6b: wrong exception message, got: %s', sqlerrm);
      end if;
  end;
  if not v_raised then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — M6b: appointing a user with no profile row succeeded instead of raising';
  end if;
  if exists (select 1 from public.official_actions
              where target_id = 'aaaaaaaa-0000-0000-0000-00000000000b') then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — M6b: an official.appointed row was recorded for an appointment that changed nothing';
  end if;
  raise notice 'ok, M6b: appoint_official raised for a user with no profile row';
end $$;

-- M8: anon holds no SELECT grant on official_actions. RLS already returns
-- nothing to anon; the grant says no as well. Checked in the catalog, since
-- that is what flips if the revoke is missing, and by attempting the read.
do $$
begin
  if has_table_privilege('anon', 'public.official_actions', 'SELECT') then
    raise exception using errcode = 'TSTFL',
      message = 'TEST FAILED — M8: anon has SELECT on public.official_actions';
  end if;
  raise notice 'ok, M8: anon has no SELECT grant on public.official_actions';
end $$;

select tests.as_anon();
select tests.expect_denied(
  'M8: anon cannot select from official_actions (grant-level, not only RLS)',
  $$select * from public.official_actions$$);

-- ===========================================================================
-- Monitoring: app_errors is written only through report_app_error, read by no
-- client, deduplicated, capped, and self-cleaning.
-- ===========================================================================
select tests.as_anon();
select tests.expect_denied('M1: anon cannot read app_errors', $$select * from public.app_errors$$);
select tests.expect_denied('M2: anon cannot insert app_errors directly',
  $$insert into public.app_errors (source, kind, message, route, environment, fingerprint)
    values ('client','unhandled','x','/','preview','f')$$);
select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_denied('M3: authenticated cannot delete app_errors', $$delete from public.app_errors$$);
select tests.expect_denied('M4: authenticated cannot update app_errors', $$update public.app_errors set message = 'x'$$);

select tests.as_anon();
select tests.expect_allowed('M5: anon can report an error',
  $$select public.report_app_error('client','unhandled','boom','at a (x.js:1:1)','/map','preview','abc123','fp-m5')$$);
select tests.expect_allowed('M6: a repeat within 5 minutes is accepted but not stored twice',
  $$select public.report_app_error('client','unhandled','boom','at a (x.js:1:1)','/map','preview','abc123','fp-m5')$$);

do $$
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  if (select count(*) from public.app_errors where fingerprint = 'fp-m5') <> 1 then
    raise exception using errcode = 'TSTFL', message = 'M6: duplicate fingerprint stored twice';
  end if;
end $$;

select tests.as_anon();
select tests.expect_allowed('M7: over-long input is truncated, not raised',
  $$select public.report_app_error('server','request', repeat('m', 900), repeat('s', 9000), repeat('/r', 300), 'production', repeat('z', 90), 'fp-m7')$$);

do $$
declare r record;
begin
  set local role postgres;
  select length(message) lm, length(stack) ls, length(route) lr, length(release) lrel into r
    from public.app_errors where fingerprint = 'fp-m7';
  if r.lm <> 500 or r.ls <> 4000 or r.lr <> 200 or r.lrel <> 64 then
    raise exception using errcode = 'TSTFL', message = format('M7: not truncated to limits: %s', r);
  end if;

  -- M8: rows older than 30 days are removed by the next report.
  insert into public.app_errors (occurred_at, source, kind, message, route, environment, fingerprint)
    values (now() - interval '31 days', 'client', 'unhandled', 'old', '/', 'preview', 'fp-old');
end $$;

select tests.as_anon();
select public.report_app_error('client','render','fresh', null,'/','preview', null,'fp-m8');

do $$
begin
  set local role postgres;
  if exists (select 1 from public.app_errors where fingerprint = 'fp-old') then
    raise exception using errcode = 'TSTFL', message = 'M8: 31-day-old row was not cleaned up';
  end if;

  -- M9: the hourly cap. Fill to 300 rows in the last hour, then one more must not store.
  insert into public.app_errors (source, kind, message, route, environment, fingerprint)
    select 'client','unhandled','fill','/','preview','fill-' || g from generate_series(1, 300) g;
end $$;

select tests.as_anon();
select public.report_app_error('client','unhandled','over cap', null,'/','preview', null,'fp-m9');

do $$
begin
  set local role postgres;
  if exists (select 1 from public.app_errors where fingerprint = 'fp-m9') then
    raise exception using errcode = 'TSTFL', message = 'M9: report stored beyond the hourly cap';
  end if;
end $$;

select tests.as_anon();
select tests.expect_row_count('M10: recent_app_error_count counts the last 15 minutes',
  $$select 1 where public.recent_app_error_count() >= 303$$, 1);

-- M11-M15 (final review, Minor 11): an optional environment filter, so a
-- preview crash never fails the production health check. The rows above are
-- fp-m7 (production) plus preview rows; >= rather than = because the live
-- database is shared with deployed previews that may report meanwhile.
select tests.expect_row_count('M11: recent_app_error_count(''production'') counts production rows',
  $$select 1 where public.recent_app_error_count('production') >= 1$$, 1);
select tests.expect_row_count('M12: recent_app_error_count(''preview'') counts preview rows',
  $$select 1 where public.recent_app_error_count('preview') >= 302$$, 1);
select tests.expect_row_count('M13: the two environments add up to the unfiltered count, so neither counts the other',
  $$select 1 where public.recent_app_error_count('production') + public.recent_app_error_count('preview')
                 = public.recent_app_error_count()$$, 1);
select tests.expect_row_count('M14: a null filter counts every environment, exactly like the zero-argument call',
  $$select 1 where public.recent_app_error_count(null) = public.recent_app_error_count()$$, 1);
select tests.expect_row_count('M15: an environment with no rows counts zero',
  $$select 1 where public.recent_app_error_count('staging') = 0$$, 1);

-- ===========================================================================
-- Task 1 (offline-sending): honest write times. A queued write keeps the
-- time it was made, not the time it arrives at the server. Reuses fixture
-- zone tests-area-a1 ('0199901001', inserted for the officials-and-roles
-- area-limit block above) and resident 66666666-6666-6666-6666-666666666666
-- (still role 'resident' -- see the net-score fixture comment earlier in
-- this file). The check-in cases (H5-H9) cannot reuse tests-area-a2 for
-- 66666666...: A11 above already inserted (tests-area-a2, 66666666...) and
-- evacuation_check_ins is unique on (zone_id, user_id), so each check-in
-- case below uses its own zone (or, for H7/H8, its own fresh row) to stay
-- independent.
-- ===========================================================================

select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_allowed('H1: a 5-hour-old report is kept with its own time',
  $$insert into public.water_level_reports (id, zone_id, depth_level, reporter_id, reported_at)
    values ('a0000000-0000-4000-8000-000000000001', 'tests-area-a1', 'knee',
            '66666666-6666-6666-6666-666666666666', now() - interval '5 hours')$$);
select tests.expect_row_count('H2: its reported_at is the made-at time, not arrival',
  $$select 1 from public.water_level_reports
     where id = 'a0000000-0000-4000-8000-000000000001'
       and reported_at between now() - interval '5 hours 1 minute' and now() - interval '4 hours 59 minutes'$$, 1);
-- H3: a future reported_at is clamped to now(). A do-block, not
-- tests.expect_row_count, because expect_row_count wraps its query as
-- `select count(*) from (<query>) as subquery` -- and Postgres refuses a
-- data-modifying WITH clause (the INSERT ... RETURNING the brief's own H3
-- wording uses) once it is nested inside another query's subquery rather
-- than sitting at the statement's top level ("WITH clause containing a
-- data-modifying statement must be at the top level", confirmed live).
do $$
declare
  v_reported_at timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  insert into public.water_level_reports (id, zone_id, depth_level, reporter_id, reported_at)
    values ('a0000000-0000-4000-8000-000000000002', 'tests-area-a1', 'ankle',
            '66666666-6666-6666-6666-666666666666', now() + interval '2 days');

  reset role;

  select reported_at into v_reported_at from public.water_level_reports
    where id = 'a0000000-0000-4000-8000-000000000002';

  if v_reported_at is distinct from now() then
    raise exception using errcode = 'TSTFL',
      message = format('H3: expected a future reported_at clamped to now(), got %s', v_reported_at);
  end if;
  raise notice 'ok, H3: a future reported_at is clamped to now()';
end $$;

-- H4: a 7-hour-old report is refused outright (SQLSTATE 22023, 'report too
-- old'), not silently clamped like H3's future timestamp. tests.expect_denied
-- only catches insufficient_privilege, so this is a do-block that switches
-- role the same way the file's other role-switching blocks do (e.g. the
-- self-promotion block at the top of this file), capturing the SQLSTATE and
-- message via GET STACKED DIAGNOSTICS so the role is reset on every exit
-- path before any assertion raises (Minor 8's rule).
do $$
declare
  v_sqlstate text;
  v_message text;
  v_raised boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  begin
    insert into public.water_level_reports (id, zone_id, depth_level, reporter_id, reported_at)
      values ('a0000000-0000-4000-8000-000000000003', 'tests-area-a1', 'ankle',
              '66666666-6666-6666-6666-666666666666', now() - interval '7 hours');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
  end;

  reset role;

  if not v_raised then
    raise exception using errcode = 'TSTFL',
      message = 'H4: a 7-hour-old report was accepted instead of refused';
  end if;
  if v_sqlstate is distinct from '22023' then
    raise exception using errcode = 'TSTFL',
      message = format('H4: expected SQLSTATE 22023 for an over-old report, got %s (%s)', v_sqlstate, v_message);
  end if;
  if v_message !~ 'report too old' then
    raise exception using errcode = 'TSTFL',
      message = format('H4: wrong error message for an over-old report: %s', v_message);
  end if;
  raise notice 'ok, H4: a 7-hour-old report raised 22023 (report too old)';
end $$;

-- H9: an insert naming no reported_at at all still gets now() (the column
-- default, unchanged by this task, but worth pinning down alongside H1-H4).
-- A do-block for the same reason as H3: expect_row_count's own wrapping
-- subquery refuses a nested data-modifying WITH clause.
do $$
declare
  v_reported_at timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  insert into public.water_level_reports (id, zone_id, depth_level, reporter_id)
    values ('a0000000-0000-4000-8000-000000000004', 'tests-area-a1', 'knee',
            '66666666-6666-6666-6666-666666666666');

  reset role;

  select reported_at into v_reported_at from public.water_level_reports
    where id = 'a0000000-0000-4000-8000-000000000004';

  if v_reported_at is distinct from now() then
    raise exception using errcode = 'TSTFL',
      message = format('H9: expected reported_at to default to now(), got %s', v_reported_at);
  end if;
  raise notice 'ok, H9: an insert with no reported_at gets now()';
end $$;

-- H5: a check-in with checked_in_at = now() - 9 hours is kept with that
-- time. Own zone (tests-area-a1) so it cannot collide with A11's
-- (tests-area-a2, 66666666...) check-in already in the table.
do $$
declare
  v_checked_in_at timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  insert into public.evacuation_check_ins (id, zone_id, user_id, status, checked_in_at)
    values ('b0000000-0000-4000-8000-000000000001', 'tests-area-a1',
            '66666666-6666-6666-6666-666666666666', 'safe', now() - interval '9 hours');

  reset role;

  select checked_in_at into v_checked_in_at from public.evacuation_check_ins
    where id = 'b0000000-0000-4000-8000-000000000001';

  if v_checked_in_at is null
     or v_checked_in_at < now() - interval '9 hours 1 minute'
     or v_checked_in_at > now() - interval '8 hours 59 minutes' then
    raise exception using errcode = 'TSTFL',
      message = format('H5: expected checked_in_at ~9 hours ago, got %s', v_checked_in_at);
  end if;
  raise notice 'ok, H5: a 9-hour-old check-in is kept with its own time';
end $$;

-- H6: a future checked_in_at is clamped to now(). Own zone (tests-area-b1,
-- inserted for the area-limit block above) so it cannot collide with H5's
-- (tests-area-a1, 66666666...) row just inserted.
do $$
declare
  v_checked_in_at timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  insert into public.evacuation_check_ins (id, zone_id, user_id, status, checked_in_at)
    values ('b0000000-0000-4000-8000-000000000002', 'tests-area-b1',
            '66666666-6666-6666-6666-666666666666', 'safe', now() + interval '2 days');

  reset role;

  select checked_in_at into v_checked_in_at from public.evacuation_check_ins
    where id = 'b0000000-0000-4000-8000-000000000002';

  if v_checked_in_at is distinct from now() then
    raise exception using errcode = 'TSTFL',
      message = format('H6: expected a future checked_in_at clamped to now(), got %s', v_checked_in_at);
  end if;
  raise notice 'ok, H6: a future checked_in_at is clamped to now()';
end $$;

-- H7 setup: an initial check-in on a fresh (zone_id, user_id) pair --
-- tests-fixture-zone has never held a check-in for 66666666... -- stored at
-- now() - 1 hour, status safe.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  insert into public.evacuation_check_ins (id, zone_id, user_id, status, checked_in_at)
    values ('b0000000-0000-4000-8000-000000000003', 'tests-fixture-zone',
            '66666666-6666-6666-6666-666666666666', 'safe', now() - interval '1 hour');

  reset role;
end $$;

-- H7: an upsert on the same (zone_id, user_id) with an OLDER checked_in_at
-- (now() - 3 hours) and a different status (needs_help) must not replace
-- either the status or the time -- the BEFORE UPDATE trigger's older-than
-- guard returns OLD outright, making the whole row update a no-op. The
-- INSERT ... ON CONFLICT (zone_id, user_id) DO UPDATE SET <every payload
-- column> shape below is exactly what PostgREST emits for supabase-js
-- .upsert(..., { onConflict: "zone_id,user_id" }) -- not a bare UPDATE -- so
-- this exercises the path the Server Action (record-check-in.ts) actually
-- uses. A fresh id (…004) stands in for the outbox's own id on this second
-- queued write, the same way a second real queued write would carry one.
do $$
declare
  v_status text;
  v_checked_in_at timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  insert into public.evacuation_check_ins (id, zone_id, user_id, status, checked_in_at)
    values ('b0000000-0000-4000-8000-000000000004', 'tests-fixture-zone',
            '66666666-6666-6666-6666-666666666666', 'needs_help', now() - interval '3 hours')
  on conflict (zone_id, user_id) do update set
    id = excluded.id,
    zone_id = excluded.zone_id,
    user_id = excluded.user_id,
    status = excluded.status,
    checked_in_at = excluded.checked_in_at;

  reset role;

  select status, checked_in_at into v_status, v_checked_in_at
    from public.evacuation_check_ins
    where zone_id = 'tests-fixture-zone' and user_id = '66666666-6666-6666-6666-666666666666';

  if v_status is distinct from 'safe'
     or v_checked_in_at < now() - interval '1 hour 1 minute'
     or v_checked_in_at > now() - interval '59 minutes' then
    raise exception using errcode = 'TSTFL',
      message = format(
        'H7: an older check-in overwrote the newer stored one -- status %s, checked_in_at %s', v_status, v_checked_in_at);
  end if;
  raise notice 'ok, H7: an upsert carrying an older checked_in_at does not overwrite the newer stored row';
end $$;

-- H8: the pairing half -- an upsert on the same pair with a NEWER
-- checked_in_at than the row H7 left in place (now() - 1 hour) DOES update,
-- status included. Another fresh id (…005), same reasoning as H7.
do $$
declare
  v_status text;
  v_checked_in_at timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  insert into public.evacuation_check_ins (id, zone_id, user_id, status, checked_in_at)
    values ('b0000000-0000-4000-8000-000000000005', 'tests-fixture-zone',
            '66666666-6666-6666-6666-666666666666', 'needs_help', now() - interval '30 minutes')
  on conflict (zone_id, user_id) do update set
    id = excluded.id,
    zone_id = excluded.zone_id,
    user_id = excluded.user_id,
    status = excluded.status,
    checked_in_at = excluded.checked_in_at;

  reset role;

  select status, checked_in_at into v_status, v_checked_in_at
    from public.evacuation_check_ins
    where zone_id = 'tests-fixture-zone' and user_id = '66666666-6666-6666-6666-666666666666';

  if v_status is distinct from 'needs_help'
     or v_checked_in_at < now() - interval '31 minutes'
     or v_checked_in_at > now() - interval '29 minutes' then
    raise exception using errcode = 'TSTFL',
      message = format(
        'H8: a newer check-in did not overwrite the older stored one -- status %s, checked_in_at %s', v_status, v_checked_in_at);
  end if;
  raise notice 'ok, H8: an upsert carrying a newer checked_in_at updates the stored row (status included)';
end $$;

-- ===========================================================================
-- Final review, Minor 8: the honest-time trigger functions keep no default
-- PUBLIC EXECUTE, matching this repository's other private trigger
-- functions. A trigger fires without EXECUTE on its function, so H1-H9 above
-- already ran against the revoked functions; H15 re-checks both on fresh
-- rows. has_function_privilege is the assertion that bites: `private` grants
-- no USAGE to client roles, so a direct call (H13/H14) is refused at the
-- schema whether or not EXECUTE was revoked.
-- ===========================================================================
do $$
begin
  if has_function_privilege('anon', 'private.honest_report_time()', 'execute')
     or has_function_privilege('authenticated', 'private.honest_report_time()', 'execute')
     or has_function_privilege('anon', 'private.honest_check_in_time()', 'execute')
     or has_function_privilege('authenticated', 'private.honest_check_in_time()', 'execute') then
    raise exception using errcode = 'TSTFL',
      message = 'H12: anon or authenticated can still execute a private honest-time trigger function';
  end if;
  if exists (
    select 1
      from pg_proc p,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid in ('private.honest_report_time()'::regprocedure,
                     'private.honest_check_in_time()'::regprocedure)
       and a.grantee = 0
       and a.privilege_type = 'EXECUTE'
  ) then
    raise exception using errcode = 'TSTFL',
      message = 'H12: PUBLIC still has EXECUTE on a private honest-time trigger function';
  end if;
  raise notice 'ok, H12: no client role and not PUBLIC can execute the honest-time trigger functions';
end $$;

select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_denied('H13: authenticated cannot call private.honest_report_time() directly',
  $$select private.honest_report_time()$$);
select tests.expect_denied('H14: authenticated cannot call private.honest_check_in_time() directly',
  $$select private.honest_check_in_time()$$);

-- H15: both triggers still fire for a client insert after the revoke: a
-- future reported_at and a future checked_in_at are each clamped to now().
do $$
declare
  v_reported_at timestamptz;
  v_checked_in_at timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  insert into public.water_level_reports (id, zone_id, depth_level, reporter_id, reported_at)
    values ('a0000000-0000-4000-8000-000000000005', 'tests-area-a1', 'ankle',
            '66666666-6666-6666-6666-666666666666', now() + interval '1 day');
  insert into public.evacuation_check_ins (id, zone_id, user_id, status, checked_in_at)
    values ('b0000000-0000-4000-8000-000000000006', 'tests-fixture-zone-3',
            '66666666-6666-6666-6666-666666666666', 'safe', now() + interval '1 day');

  reset role;

  select reported_at into v_reported_at from public.water_level_reports
    where id = 'a0000000-0000-4000-8000-000000000005';
  select checked_in_at into v_checked_in_at from public.evacuation_check_ins
    where id = 'b0000000-0000-4000-8000-000000000006';

  if v_reported_at is distinct from now() or v_checked_in_at is distinct from now() then
    raise exception using errcode = 'TSTFL',
      message = format('H15: a trigger did not fire after the revoke -- reported_at %s, checked_in_at %s',
                       v_reported_at, v_checked_in_at);
  end if;
  raise notice 'ok, H15: both honest-time triggers still fire after the EXECUTE revoke';
end $$;

-- ===========================================================================
-- Official markers: any appointed official may create, read or delete any
-- marker; anon and residents can do none of those. Not zone-scoped (see the
-- migration's own comment) -- OM7/OM8 below specifically prove an official
-- can read and delete a marker a DIFFERENT official placed, since that is
-- the property that would break if area-scoping were added later without
-- updating these tests to match.
-- ===========================================================================

select tests.as_anon();
select tests.expect_denied('OM1: anon cannot read official_markers',
  $$select * from public.official_markers$$);
select tests.expect_denied('OM2: anon cannot insert official_markers',
  $$insert into public.official_markers (lat, lng, type, caption, placed_by)
    values (14.0, 121.0, 'flood', 'x', '44444444-4444-4444-4444-444444444444')$$);

-- A resident IS `authenticated` (holds the table-level SELECT grant, same
-- as every operator), so an unauthorized read is RLS silently filtering to
-- zero rows, not a thrown permission error -- expect_row_count is the
-- correct assertion for this shape, matching the zones/profiles/alerts
-- "unchanged value / zero rows" pattern used throughout this file. (anon's
-- OM1 above IS a thrown error, correctly, because anon holds no table grant
-- at all after this migration's revoke.)
select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_row_count('OM3: a resident reads zero official_markers rows (RLS filters silently, not an error)',
  $$select * from public.official_markers$$, 0);
select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_denied('OM4: a resident cannot insert official_markers',
  $$insert into public.official_markers (lat, lng, type, caption, placed_by)
    values (14.0, 121.0, 'flood', 'x', '66666666-6666-6666-6666-666666666666')$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed('OM5: an official can insert a marker as themselves',
  $$insert into public.official_markers (id, lat, lng, type, caption, placed_by)
    values ('c0000000-0000-4000-8000-000000000001', 14.05, 121.05, 'blocked', 'Bridge closed',
            '44444444-4444-4444-4444-444444444444')$$);

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_denied('OM6: an official cannot insert a marker attributed to someone else',
  $$insert into public.official_markers (lat, lng, type, caption, placed_by)
    values (14.05, 121.05, 'flood', 'x', '55555555-5555-5555-5555-555555555555')$$);

-- OM7: a DIFFERENT official (municipal, area 0199901) can still read the
-- marker A1 placed -- proving read is not restricted to the placer or to
-- the placer's own area.
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_row_count('OM7: a different official can read a marker placed by another official',
  $$select 1 from public.official_markers where id = 'c0000000-0000-4000-8000-000000000001'$$, 1);

-- OM8: that same different official can also delete it.
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.expect_allowed('OM8: a different official can delete a marker placed by another official',
  $$delete from public.official_markers where id = 'c0000000-0000-4000-8000-000000000001'$$);

do $$
begin
  set local role postgres;
  if exists (select 1 from public.official_markers where id = 'c0000000-0000-4000-8000-000000000001') then
    raise exception using errcode = 'TSTFL', message = 'OM8: marker still present after the delete';
  end if;
end $$;

select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.expect_allowed('OM9 setup: reinsert a marker to test resident deletion against',
  $$insert into public.official_markers (id, lat, lng, type, caption, placed_by)
    values ('c0000000-0000-4000-8000-000000000002', 14.05, 121.05, 'flood', 'x',
            '44444444-4444-4444-4444-444444444444')$$);

-- Same shape again for DELETE: the grant exists, so an unmatched USING
-- clause is a silent zero-row delete, not a thrown error. A raw role switch
-- (not tests.expect_denied) proves it the same way OM3 does, checking the
-- row is still there afterward rather than expecting an exception.
select tests.as_user('66666666-6666-6666-6666-666666666666');
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);
  delete from public.official_markers where id = 'c0000000-0000-4000-8000-000000000002';
  reset role;
end $$;

do $$
begin
  set local role postgres;
  if not exists (select 1 from public.official_markers where id = 'c0000000-0000-4000-8000-000000000002') then
    raise exception using errcode = 'TSTFL',
      message = 'OM9: a resident''s DELETE removed a marker it should not have matched';
  end if;
  raise notice 'ok, OM9: a resident cannot delete an official marker (RLS filtered it, zero rows affected)';
end $$;

-- Admin role (2026-09-22 plan, Task 1): an admin fixture, appointed the
-- same way any operator fixture in this file is — directly, as postgres,
-- bypassing RLS. Fresh ids/zone (not the earlier 1111.../3333.../
-- tests-fixture-zone-2 fixtures — this file has 2400+ lines of
-- accumulated state on those by this point).
do $$
declare
  admin_id uuid := 'd0000000-0000-4000-8000-000000000001';
begin
  insert into auth.users (id) values (admin_id);
  update public.profiles
     set role = 'admin', display_name = 'Test Admin'
   where id = admin_id;
end $$;

insert into public.zones
  (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
values
  ('tests-fixture-zone-admin', '000000002', 'Test Zone Admin', '{"en":"x","fil":"x"}'::jsonb, 14.2, 121.2, '[]'::jsonb, '000');

-- Critical: an admin manages a zone they have no area_code overlap with
-- at all (their area_code is NULL) — proving the OR branch in
-- manages_zone, not a coincidental prefix match.
select tests.as_user('d0000000-0000-4000-8000-000000000001');
select tests.expect_allowed(
  'an admin CAN issue an alert for a zone with no area_code relationship to them',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('tests-fixture-zone-admin', 'yellow', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

-- A plain resident must still be refused the same action, or the test
-- above would prove nothing about the admin branch specifically.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident (not admin, not operator) cannot issue an alert',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('tests-fixture-zone-admin', 'red', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

-- admin_appoint_official / admin_remove_official: gated to admin only.
-- A fresh target user this block appoints and then removes, so the two
-- calls do not depend on ordering against any other fixture in this file.
insert into auth.users (id, email, is_anonymous, email_confirmed_at)
  values ('d0000000-0000-4000-8000-000000000002', 'appointee@example.com', false, now());

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'a resident cannot call admin_appoint_official',
  $$select public.admin_appoint_official('appointee@example.com', '0105528', 'Test Appointee')$$);

select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.expect_denied(
  'an official (not admin) cannot call admin_appoint_official',
  $$select public.admin_appoint_official('appointee@example.com', '0105528', 'Test Appointee')$$);

select tests.as_user('d0000000-0000-4000-8000-000000000001');
select tests.expect_allowed(
  'an admin CAN call admin_appoint_official',
  $$select public.admin_appoint_official('appointee@example.com', '0105528', 'Test Appointee')$$);

do $$
declare
  observed_role text;
  observed_name text;
begin
  select role, display_name into observed_role, observed_name
    from public.profiles where id = 'd0000000-0000-4000-8000-000000000002';
  if observed_role is distinct from 'operator' or observed_name is distinct from 'Test Appointee' then
    raise exception using errcode = 'TSTFL',
      message = format('admin_appoint_official did not appoint correctly: role=%s name=%s', observed_role, observed_name);
  end if;
  raise notice 'ok: admin_appoint_official appointed the target correctly';
end $$;

select tests.as_user('d0000000-0000-4000-8000-000000000001');
select tests.expect_allowed(
  'an admin CAN call admin_remove_official',
  $$select public.admin_remove_official('appointee@example.com')$$);

do $$
declare
  observed_role text;
begin
  select role into observed_role from public.profiles where id = 'd0000000-0000-4000-8000-000000000002';
  if observed_role is distinct from 'resident' then
    raise exception using errcode = 'TSTFL',
      message = format('admin_remove_official did not remove correctly: role=%s', observed_role);
  end if;
  raise notice 'ok: admin_remove_official removed the target correctly';
end $$;

-- Regression for the live bug found during Task 8 verification
-- (2026-09-22-admin-role-and-password-auth): profiles' only SELECT policy
-- was self-only (profiles_read_own), so /admin/officials always returned
-- an empty list for a real admin despite real appointed officials existing.
-- Still impersonating the admin from the block above.
do $$
declare
  seen boolean;
begin
  select exists(select 1 from public.profiles where id = 'd0000000-0000-4000-8000-000000000002') into seen;
  if not seen then
    raise exception using errcode = 'TSTFL',
      message = 'admin could not read another profile row (profiles_read_own_or_admin regressed)';
  end if;
  raise notice 'ok: admin can read another profile row';
end $$;

select tests.as_user('d0000000-0000-4000-8000-000000000002');
do $$
declare
  seen boolean;
begin
  select exists(select 1 from public.profiles where id = 'd0000000-0000-4000-8000-000000000001') into seen;
  if seen then
    raise exception using errcode = 'TSTFL',
      message = 'a non-admin could read another profile row (profiles_read_own_or_admin over-widened)';
  end if;
  raise notice 'ok: a non-admin still cannot read another profile row';
end $$;

-- Regression for a final-review finding (2026-09-22-admin-role-and-password-auth):
-- an admin could use the appoint form on another admin's (or their own)
-- email, silently demoting them. Spec: "Appoint and remove admins: No —
-- still by hand, in Supabase, by you." Uses the fixture admin's OWN email
-- (a self-demote attempt) rather than a real production address. The
-- fixture admin was created with no email (Task 1's setup only inserts an
-- id); the guard matches on email, so one is set here first. reset role
-- first — the previous block left the session impersonating a non-admin,
-- which cannot write auth.users.
reset role;
update auth.users set email = 'admin-fixture@example.com' where id = 'd0000000-0000-4000-8000-000000000001';

select tests.as_user('d0000000-0000-4000-8000-000000000001');

do $$
begin
  perform public.admin_appoint_official('admin-fixture@example.com', 'Mapandan', 'Self Demote');
  raise exception using errcode = 'TSTFL',
    message = 'admin_appoint_official let an admin demote another admin — should have refused';
exception
  when others then
    if sqlstate = 'TSTFL' then
      raise;
    end if;
    raise notice 'ok: admin_appoint_official refused to touch an admin account (%): %', sqlstate, sqlerrm;
end $$;

do $$
begin
  perform public.admin_remove_official('admin-fixture@example.com');
  raise exception using errcode = 'TSTFL',
    message = 'admin_remove_official let an admin remove another admin — should have refused';
exception
  when others then
    if sqlstate = 'TSTFL' then
      raise;
    end if;
    raise notice 'ok: admin_remove_official refused to touch an admin account (%): %', sqlstate, sqlerrm;
end $$;

-- ===========================================================================
-- Sub-project 1 (2026-09-23): stop the bleeding. SP1 fixtures: one zone and
-- twenty users, used only by the SP1 blocks below. Self-contained, so any SP1
-- block can also run alone as: begin; <this block> <that block> rollback;
-- ===========================================================================
do $$
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id)
    select ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid
      from generate_series(1, 20) g;
  insert into public.zones
    (id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number)
  values
    ('tests-fixture-zone-sp1', '990000001', 'Test Zone SP1', '{"en":"x","fil":"x"}'::jsonb,
     14.5, 121.5, '[]'::jsonb, '000');
  reset role;
end $$;

-- SP1 engine: only located, non-dry reports count; alerts are yellow and
-- unverified; any active alert is left alone; reports older than the last
-- human decision do not count.
do $$
declare
  z constant text := 'tests-fixture-zone-sp1';
  n int;
  a record;
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  -- alerts_record_cleared is deferred to commit; this suite never commits,
  -- so fire it at statement end instead.
  set constraints all immediate;

  -- E1: three neck-deep reports with no location never trigger.
  insert into public.water_level_reports (zone_id, depth_level, reporter_id)
    select z, 'neck', ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid
      from generate_series(1, 3) g;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = z and is_active) then
    raise exception using errcode = 'TSTFL', message = 'E1: reports without a location triggered an alert';
  end if;
  raise notice 'ok E1: reports without a location do not trigger';

  -- E2: three located "dry" reports never trigger.
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng)
    select z, 'dry', ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, 14.5, 121.5
      from generate_series(4, 6) g;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = z and is_active) then
    raise exception using errcode = 'TSTFL', message = 'E2: dry reports triggered an alert';
  end if;
  raise notice 'ok E2: dry reports do not trigger';

  -- E3: three located knee-deep reports trigger one yellow, unverified alert.
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng)
    select z, 'knee', ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, 14.5, 121.5
      from generate_series(7, 9) g;
  perform * from public.check_and_trigger_alerts();
  select al.severity, al.source, al.message->>'en' as en into a
    from public.alerts al where al.zone_id = z and al.is_active;
  if a.severity is distinct from 'yellow'
     or a.source is distinct from 'auto_crowdsourced'
     or a.en is distinct from 'Advisory — 3 residents report knee-deep water (unverified).' then
    raise exception using errcode = 'TSTFL', message = format('E3: expected an unverified yellow advisory, got %s', a);
  end if;
  raise notice 'ok E3: three located knee-deep reports raise an unverified yellow advisory';

  -- E4: running again does not re-issue (no repeated push).
  perform * from public.check_and_trigger_alerts();
  select count(*) into n from public.alerts where zone_id = z;
  if n <> 1 then
    raise exception using errcode = 'TSTFL', message = format('E4: engine re-issued its own alert (%s rows)', n);
  end if;
  raise notice 'ok E4: no re-issue';

  -- E5: an official's clear is not undone by the reports it has already seen.
  perform public.set_zone_alert(z, null, null, 'manual');
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = z and is_active) then
    raise exception using errcode = 'TSTFL', message = 'E5: engine re-raised an alert an official just cleared';
  end if;
  raise notice 'ok E5: a clear holds';

  -- E6: reports after the decision do count (decision moved one minute back).
  update public.official_actions set occurred_at = now() - interval '1 minute'
   where zone_id = z and action = 'alert.cleared';
  perform * from public.check_and_trigger_alerts();
  if not exists (select 1 from public.alerts where zone_id = z and is_active and severity = 'yellow') then
    raise exception using errcode = 'TSTFL', message = 'E6: reports after the decision did not trigger';
  end if;
  raise notice 'ok E6: reports after a decision count';

  -- E7: an official's alert is never replaced or downgraded.
  perform public.set_zone_alert(z, 'red', '{"en":"r","fil":"r"}'::jsonb, 'manual');
  perform * from public.check_and_trigger_alerts();
  select al.severity, al.source into a from public.alerts al where al.zone_id = z and al.is_active;
  if a.severity is distinct from 'red' or a.source is distinct from 'manual' then
    raise exception using errcode = 'TSTFL', message = format('E7: engine touched an official''s alert: %s', a);
  end if;
  raise notice 'ok E7: official alert untouched';

  -- E8: an active alert from another automatic source is left alone.
  perform public.set_zone_alert(z, 'orange', '{"en":"c","fil":"c"}'::jsonb, 'cascade');
  perform * from public.check_and_trigger_alerts();
  select al.severity, al.source into a from public.alerts al where al.zone_id = z and al.is_active;
  if a.severity is distinct from 'orange' or a.source is distinct from 'cascade' then
    raise exception using errcode = 'TSTFL', message = format('E8: engine replaced a cascade alert: %s', a);
  end if;
  raise notice 'ok E8: other automatic alerts untouched';

  -- E9: reports made before a decision but delivered after it do not count.
  perform public.set_zone_alert(z, null, null, 'manual');
  insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng, reported_at)
    select z, 'knee', ('e1000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid,
           14.5, 121.5, now() - interval '10 minutes'
      from generate_series(10, 12) g;
  perform * from public.check_and_trigger_alerts();
  if exists (select 1 from public.alerts where zone_id = z and is_active) then
    raise exception using errcode = 'TSTFL', message = 'E9: reports made before the decision triggered after it';
  end if;
  raise notice 'ok E9: offline reports made before a decision do not count';

  reset role;
end $$;

-- SP1 permissions (H3): the engine and the cleanup are server-only; the two
-- unused, publicly callable functions are gone.
select tests.as_anon();
select tests.expect_denied('SP1-P1: anon cannot run the alert engine',
  $$select * from public.check_and_trigger_alerts()$$);
select tests.expect_denied('SP1-P2: anon cannot run the weather cleanup',
  $$select public.cleanup_old_weather_readings()$$);
select tests.as_user('e1000000-0000-4000-8000-000000000001');
select tests.expect_denied('SP1-P3: a signed-in resident cannot run the alert engine',
  $$select * from public.check_and_trigger_alerts()$$);
select tests.expect_denied('SP1-P4: a signed-in resident cannot run the weather cleanup',
  $$select public.cleanup_old_weather_readings()$$);

do $$
begin
  if not has_function_privilege('service_role', 'public.check_and_trigger_alerts()', 'execute')
     or not has_function_privilege('service_role', 'public.cleanup_old_weather_readings()', 'execute') then
    raise exception using errcode = 'TSTFL',
      message = 'SP1-P5: the scheduled jobs (service_role) lost access to the engine or the cleanup';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('get_push_subscriptions_for_zone', 'get_reference_data_compact')) then
    raise exception using errcode = 'TSTFL',
      message = 'SP1-P6: an unused, publicly callable function still exists';
  end if;
  raise notice 'ok SP1-P5/P6';
end $$;

-- SP1 report privacy (widened M3): nobody reads a report's GPS position or
-- who filed it; a resident reads their own reports through
-- my_water_level_reports(); filing a report still works.
do $$
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  insert into public.water_level_reports (id, zone_id, depth_level, reporter_id, lat, lng)
    values ('e2000000-0000-4000-8000-000000000001', 'tests-fixture-zone-sp1', 'waist',
            'e1000000-0000-4000-8000-000000000013', 14.5, 121.5);
  reset role;
end $$;

select tests.as_anon();
select tests.expect_denied('SP1-R1: anon cannot read report GPS',
  $$select lat, lng from public.water_level_reports$$);
select tests.expect_denied('SP1-R2: anon cannot read who filed a report',
  $$select reporter_id from public.water_level_reports$$);
select tests.expect_allowed('SP1-R3: anon still reads the public report fields',
  $$select id, zone_id, depth_level, reported_at, trust_weight, is_outlier from public.water_level_reports$$);

select tests.as_user('e1000000-0000-4000-8000-000000000014');
select tests.expect_denied('SP1-R4: a signed-in resident cannot read report GPS either',
  $$select lat, lng from public.water_level_reports$$);
select tests.expect_allowed('SP1-R5: a resident can still file a located report',
  $$insert into public.water_level_reports (zone_id, depth_level, reporter_id, lat, lng)
    values ('tests-fixture-zone-sp1', 'ankle', 'e1000000-0000-4000-8000-000000000014', 14.5, 121.5)$$);

do $$
declare
  mine int;
  others int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e1000000-0000-4000-8000-000000000013', 'role', 'authenticated')::text, true);
  select count(*) into mine from public.my_water_level_reports()
   where id = 'e2000000-0000-4000-8000-000000000001';
  select count(*) into others from public.my_water_level_reports()
   where id <> 'e2000000-0000-4000-8000-000000000001';
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if mine <> 1 or others <> 0 then
    raise exception using errcode = 'TSTFL',
      message = format('SP1-R6: my_water_level_reports returned own=%s others=%s, expected 1 and 0', mine, others);
  end if;
  raise notice 'ok SP1-R6: a resident sees exactly their own reports';
end $$;

-- SP1 push targeting (H4): a subscription with no barangay used to receive
-- every barangay's alerts. The database now refuses one.
do $$
begin
  set local role postgres;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, zone_id)
      values ('e1000000-0000-4000-8000-000000000015', 'https://push.example/sp1', 'k', 'a', null);
    reset role;
    raise exception using errcode = 'TSTFL', message = 'SP1-S1: a push subscription with no barangay was accepted';
  exception when not_null_violation then
    raise notice 'ok SP1-S1: a subscription must name its barangay';
  end;
  reset role;
end $$;

-- SP1 error-log cap (L3, correction 5): 300/hour x 30-day retention allowed
-- ~216,000 rows (~1 GB). A 5,000-row total cap bounds it. Fillers are two
-- hours old so the existing hourly cap cannot be what refuses the call.
do $$
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
  delete from public.app_errors;
  insert into public.app_errors (occurred_at, source, kind, message, route, environment, fingerprint)
    select now() - interval '2 hours', 'client', 'unhandled', 'fill', '/', 'preview', 'sp1-fill-' || g
      from generate_series(1, 4999) g;
  reset role;
end $$;

select tests.as_anon();
select tests.expect_allowed('SP1-E1: the 5,000th row is still accepted',
  $$select public.report_app_error('client','unhandled','under cap', null,'/','preview', null,'fp-sp1-a')$$);
select tests.expect_allowed('SP1-E2: a call past the total cap succeeds without storing',
  $$select public.report_app_error('client','unhandled','over cap', null,'/','preview', null,'fp-sp1-b')$$);

do $$
begin
  set local role postgres;
  if not exists (select 1 from public.app_errors where fingerprint = 'fp-sp1-a') then
    reset role;
    raise exception using errcode = 'TSTFL', message = 'SP1-E1: the row under the total cap was not stored';
  end if;
  if exists (select 1 from public.app_errors where fingerprint = 'fp-sp1-b') then
    reset role;
    raise exception using errcode = 'TSTFL', message = 'SP1-E2: a row was stored beyond the 5,000-row total cap';
  end if;
  reset role;
  raise notice 'ok SP1-E1/E2: the error log is capped at 5,000 rows';
end $$;

rollback;
