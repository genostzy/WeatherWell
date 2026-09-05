create schema if not exists tests;

-- Record the desired impersonation for the *next* call to expect_denied/
-- expect_allowed. This deliberately does NOT switch the ambient session role
-- itself. Helper functions live in schema `tests`, which has no grants for
-- anon/authenticated (see the revoke at the bottom of this file): if this
-- function switched the ambient role and it stayed switched across the next
-- top-level statement, that next statement — typically
-- `select tests.expect_denied(...)` — would itself fail with "permission
-- denied for schema tests" before ever reaching the statement under test.
-- The uuid need not exist in auth.users for RLS to evaluate
-- (select auth.uid()) — only for foreign keys to be satisfiable.
create or replace function tests.as_user(user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('tests.impersonate_role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text, true);
end $$;

create or replace function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('tests.impersonate_role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

-- Asserts a statement is refused. Switches to the role recorded by as_user/
-- as_anon only for the duration of `stmt`, then always resets back to the
-- caller's own role (session_user) before returning — on denial, on an
-- unexpected success, AND on any other exception raised by `stmt` — so
-- schema `tests` stays reachable (as postgres) for the next assertion in the
-- script no matter how this one turns out. An exception other than
-- insufficient_privilege (e.g. foreign_key_violation, check_violation) is
-- NOT treated as a denial: it means the statement never actually exercised
-- the policy under test, so it is re-raised (with the label attached) rather
-- than silently counted as a pass or a plain "denied".
create or replace function tests.expect_denied(label text, stmt text) returns void
language plpgsql as $$
declare
  target_role text := current_setting('tests.impersonate_role', true);
  was_denied boolean := false;
begin
  if target_role is not null and target_role <> '' then
    execute format('set local role %I', target_role);
  end if;

  begin
    execute stmt;
  exception
    when insufficient_privilege then
      was_denied := true;
    when others then
      execute 'reset role';
      raise exception using errcode = 'TSTFL',
        message = format(
          'TEST ERRORED — unexpected exception (not a privilege denial) in %s: %s (SQLSTATE %s)',
          label, sqlerrm, sqlstate);
  end;

  execute 'reset role';

  if was_denied then
    raise notice 'ok, denied: %', label;
  else
    raise exception using errcode = 'TSTFL',
      message = format('SECURITY TEST FAILED — expected denial, statement succeeded: %s', label);
  end if;
end $$;

create or replace function tests.expect_allowed(label text, stmt text) returns void
language plpgsql as $$
declare
  target_role text := current_setting('tests.impersonate_role', true);
  was_denied boolean := false;
begin
  if target_role is not null and target_role <> '' then
    execute format('set local role %I', target_role);
  end if;

  begin
    execute stmt;
  exception
    when insufficient_privilege then
      was_denied := true;
    when others then
      execute 'reset role';
      raise exception using errcode = 'TSTFL',
        message = format(
          'TEST ERRORED — unexpected exception (not a privilege denial) in %s: %s (SQLSTATE %s)',
          label, sqlerrm, sqlstate);
  end;

  execute 'reset role';

  if was_denied then
    raise exception using errcode = 'TSTFL',
      message = format('TEST FAILED — expected success, was denied: %s', label);
  else
    raise notice 'ok, allowed: %', label;
  end if;
end $$;

-- Asserts a query returns exactly `expected` rows under the impersonated
-- role. This is the one contract every assertion should go through instead
-- of a raw top-level statement after tests.as_user()/tests.as_anon(): a raw
-- statement runs as the caller (postgres) and silently bypasses RLS, because
-- as_user()/as_anon() only record the desired impersonation (see above) —
-- they do not themselves switch the ambient role. Resets the role on every
-- path exactly like expect_denied/expect_allowed, and re-raises (rather than
-- swallowing) any exception other than the row-count mismatch itself.
create or replace function tests.expect_row_count(label text, query text, expected int) returns void
language plpgsql as $$
declare
  target_role text := current_setting('tests.impersonate_role', true);
  actual int;
begin
  if target_role is not null and target_role <> '' then
    execute format('set local role %I', target_role);
  end if;

  begin
    execute format('select count(*) from (%s) as tests_expect_row_count_subquery', query) into actual;
  exception
    when others then
      execute 'reset role';
      raise exception using errcode = 'TSTFL',
        message = format(
          'TEST ERRORED — unexpected exception in %s: %s (SQLSTATE %s)',
          label, sqlerrm, sqlstate);
  end;

  execute 'reset role';

  if actual is distinct from expected then
    raise exception using errcode = 'TSTFL',
      message = format(
        'TEST FAILED — %s: expected %s row(s), got %s', label, expected, actual);
  else
    raise notice 'ok, row count %: % row(s)', label, actual;
  end if;
end $$;

revoke all on schema tests from public, anon, authenticated;
