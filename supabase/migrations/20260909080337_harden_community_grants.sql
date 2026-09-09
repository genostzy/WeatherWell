-- Task 2: close the column-grant and policy holes before anything writes
-- through them. `create table` hands `authenticated` a blanket INSERT/UPDATE
-- on every column; an RLS policy saying "your own row" does not narrow that
-- to "the columns that are yours to write".

-- Pins. A resident writes what a pin SAYS; the server owns when it was made.
revoke insert, update on public.community_pins from authenticated;
grant insert (id, zone_id, status_tag, caption, lat, lng, author_id)
  on public.community_pins to authenticated;
-- `removed`/`removed_reason` stay updatable because operators and residents
-- are the same Postgres role, and an operator must be able to set AND clear
-- `removed`. The split between what a resident may do to those columns and
-- what an operator may do is enforced by the trigger at the bottom of this
-- file, which is the only mechanism that sees OLD and NEW at the same time
-- (a policy's USING sees only the old row, WITH CHECK only the new one).
grant update (status_tag, caption, removed, removed_reason)
  on public.community_pins to authenticated;

-- Votes. Direction is the vote; everything else identifies it.
revoke insert, update on public.pin_votes from authenticated;
grant insert (pin_id, voter_id, direction) on public.pin_votes to authenticated;
grant update (direction) on public.pin_votes to authenticated;

-- Check-ins. Status is the message; the timestamp is the server's.
revoke insert, update on public.evacuation_check_ins from authenticated;
grant insert (id, zone_id, user_id, status) on public.evacuation_check_ins to authenticated;
grant update (status) on public.evacuation_check_ins to authenticated;

-- Alerts. Operator-only already, but issued_by is an attribution claim and
-- the server sets it from the verified uid, so nobody needs to supply it.
revoke insert, update on public.alerts from authenticated;
grant insert (id, zone_id, severity, message, source, confidence,
              predicted_timing, superseded_severity)
  on public.alerts to authenticated;
grant update (is_active, superseded_at) on public.alerts to authenticated;

-- issued_by is now uninsertable, and the column is nullable, so a manual
-- alert would lose its audit trail. A column default supplies it from the
-- verified claim instead.
--
-- NOTE: the plan text specified `set default (select auth.uid())`. Postgres
-- rejects that outright -- "cannot use subquery in DEFAULT expression",
-- SQLSTATE 0A000 -- so the plain function call is used. It is equivalent
-- here: DEFAULT expressions are evaluated per row at INSERT time in the
-- inserting session, so auth.uid() reads that session's JWT claim. The
-- `(select ...)` wrapper is an RLS-policy idiom (it makes the planner treat
-- the call as an InitPlan evaluated once per statement); it has no meaning
-- in a column default.
alter table public.alerts alter column issued_by set default auth.uid();

-- Profiles. No INSERT or UPDATE policy exists, so RLS denies both today.
-- The grant is removed anyway: `role` is not self-assignable, and that
-- should be true at two independent layers, not one.
revoke insert, update on public.profiles from authenticated;

-- Reports are historical observations: reports_insert_own is the only write
-- policy, so the UPDATE grant is unreachable today. Removed for the same
-- two-layers reason -- and because trust_weight/is_outlier, which the
-- previous migration deliberately made uninsertable, were still updatable.
revoke update on public.water_level_reports from authenticated;

-- Reference data. No write policy exists for any of these either.
revoke insert, update on public.zones from authenticated;
revoke insert, update on public.points_of_interest from authenticated;
revoke insert, update on public.hazard_susceptibility from authenticated;

-- Centres: occupancy is operator-written through a Server Action running as
-- the operator, so it needs a policy. Without one, setCenterOccupancy
-- returns zero rows and no error.
revoke insert, update on public.evacuation_centers from authenticated;
grant update (status, current_occupancy) on public.evacuation_centers to authenticated;

drop policy if exists centers_update_operator on public.evacuation_centers;
create policy centers_update_operator on public.evacuation_centers
  for update to authenticated
  using       ((select private.is_operator()))
  with check  ((select private.is_operator()));


-- ---------------------------------------------------------------------------
-- Pin moderation: replaces the trigger installed by 20260907073646.
-- ---------------------------------------------------------------------------
-- Two defects in the previous version, both proven live before this change:
--
-- 1. IT BROKE EVERY PIN UPDATE. The old trigger function was a plpgsql
--    SECURITY INVOKER function whose body called `private.is_operator()`.
--    plpgsql resolves the names in its body lazily, at first execution in a
--    backend session, using the *invoking* role's privileges -- and
--    `authenticated` has no USAGE on schema `private`. So the very first
--    UPDATE on community_pins issued by `authenticated` in a fresh
--    connection failed with "permission denied for schema private"
--    (SQLSTATE 42501), for residents and operators alike, including a plain
--    caption edit that touched no moderation column at all. It only appeared
--    to work in the RLS suite because that script performs a privileged
--    (postgres) UPDATE on the table first, which compiles and caches the
--    trigger body's plan under a role that CAN resolve the name; every
--    later authenticated UPDATE in that same session then reuses the cached
--    plan and never re-checks. Under PostgREST, where the first UPDATE on a
--    pooled connection is issued as `authenticated`, it would have failed.
--
--    An RLS policy calling the same function is fine, because a policy
--    expression is parsed once at CREATE POLICY time and stored with the
--    function OID already resolved; nothing re-resolves the name at runtime,
--    so no schema USAGE check happens. A trigger's WHEN clause is stored the
--    same way (pg_trigger.tgqual). Moving the whole condition into the WHEN
--    clause therefore gets the same treatment the policies already rely on,
--    without granting `private` USAGE to anyone and without SECURITY
--    DEFINER (which would set current_user to postgres and silently disable
--    the privileged-role exemption below).
--
-- 2. IT BLOCKED THE RESIDENT DELETE PATH. Deleting your own pin is a soft
--    delete -- it sets removed = true -- and the old rule refused any change
--    to `removed` by a non-operator, so a resident could never delete their
--    own pin. The rule that anti-abuse actually needs is one-directional: a
--    resident may set removed, but only an operator may CLEAR it. Otherwise
--    the author of a pin taken down by net-score voting simply restores it.
--
-- `removed_reason` stays operator-only in both directions: it is the record
-- of WHY a pin was taken down ('net_score' or 'admin'), and neither value is
-- a resident's to claim.
--
-- row_security_active() is how the privileged-role exemption is expressed:
-- it is false exactly for the roles RLS itself does not gate (the table
-- owner and BYPASSRLS roles -- postgres, service_role), so fixture setup and
-- admin tooling are unaffected, as they already were. It is a plain function
-- call, which matters because a trigger WHEN clause may not contain a
-- subquery -- the old `(select rolbypassrls from pg_roles ...)` form could
-- not have moved here.
drop trigger if exists pins_protect_moderation_columns on public.community_pins;
drop function if exists private.enforce_pin_moderation_columns();

create or replace function private.deny_pin_moderation_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501',
    message = 'only an operator may restore a removed pin or set removed_reason';
end $$;

-- Defence in depth, same reasoning as private.handle_new_user(): a trigger
-- function is invoked by the trigger manager, which performs no runtime
-- EXECUTE check, so this revoke does not disable the trigger. It closes the
-- (currently unreachable) path of calling the function directly as a query.
revoke execute on function private.deny_pin_moderation_write()
  from public, anon, authenticated, service_role;

create trigger pins_protect_moderation_columns
  before update on public.community_pins
  for each row
  when (
    row_security_active('public.community_pins')
    and not private.is_operator()
    and (
      (old.removed and not new.removed)
      or new.removed_reason is distinct from old.removed_reason
    )
  )
  execute function private.deny_pin_moderation_write();
