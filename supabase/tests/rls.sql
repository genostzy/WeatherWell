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

  update public.profiles set role = 'operator' where id = fixture_id;

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
  ('zone-1', '000000000', 'Test Zone', '{"en":"x","fil":"x"}'::jsonb, 14.0, 121.0, '[]'::jsonb, '000');

select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.expect_denied(
  'resident cannot issue an alert',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('zone-1', 'evacuate', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

select tests.as_anon();
select tests.expect_denied(
  'anonymous role cannot issue an alert',
  $$insert into public.alerts (zone_id, severity, message, source)
    values ('zone-1', 'evacuate', '{"en":"x","fil":"x"}'::jsonb, 'manual')$$);

-- Plain assertion (not through expect_denied/expect_allowed) that the
-- one-active-per-zone invariant is enforced by the database itself, not by
-- client convention: running as postgres bypasses RLS entirely, so this
-- proves the partial unique index, not a policy.
do $$
begin
  set local role postgres;
  insert into public.alerts (zone_id, severity, message, source)
    values ('zone-1','red','{"en":"a","fil":"a"}'::jsonb,'manual');
  begin
    insert into public.alerts (zone_id, severity, message, source)
      values ('zone-1','yellow','{"en":"b","fil":"b"}'::jsonb,'manual');
    raise exception using errcode = 'TSTFL',
      message = 'two active alerts were allowed for one zone';
  exception
    when unique_violation then raise notice 'ok: one active alert per zone enforced';
  end;
end $$;

rollback;
