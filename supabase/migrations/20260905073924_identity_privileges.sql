-- Corrective migration recording the privilege state actually live on the
-- database after Task 2's out-of-band execute_sql correction (see
-- task-2-report.md). Idempotent: every statement is a plain revoke/grant
-- that is safe to re-run.

-- private.is_operator(): the aggressive revoke recorded under migration
-- 20260905071611 also stripped EXECUTE from `authenticated` and
-- `service_role`, which breaks the profiles_read_own_or_operator policy
-- (it calls this function while running AS authenticated). The corrected,
-- live state revokes only from public and anon, and keeps EXECUTE granted
-- to authenticated and service_role because policies run as those roles.
revoke execute on function private.is_operator() from public, anon;
grant execute on function private.is_operator() to authenticated, service_role;

-- private.handle_new_user(): still carried Postgres's default PUBLIC
-- EXECUTE grant, unlike is_operator() which was deliberately hardened.
-- There is no live exploit path today (schema `private` grants no USAGE to
-- anon/authenticated, and a `returns trigger` function cannot be invoked
-- outside a trigger), but a later, unrelated grant of `private` USAGE would
-- silently reopen it. Revoke PUBLIC execute now to close that gap
-- defensively; the trigger itself is unaffected because triggers execute as
-- the table owner, not as the invoking role.
revoke execute on function private.handle_new_user() from public, anon, authenticated;
