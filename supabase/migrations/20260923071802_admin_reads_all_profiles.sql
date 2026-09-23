-- Task 4 (2026-09-22-admin-role-and-password-auth) needs an admin to list
-- every operator's profile on /admin/officials. `profiles`'s only SELECT
-- policy is `profiles_read_own` (self-only) — the 09-11 official_areas
-- migration deliberately dropped the old `profiles_read_own_or_operator`
-- policy when it moved every other officials-facing policy to area-scoped
-- visibility (`manages_zone`), and rightly gave a barangay/municipal
-- official no reason to see other people's profiles. Task 1's own migration
-- only widened `is_operator()`/`manages_zone()`/`record_official_action()`,
-- never touching `profiles`'s RLS — it assumed the old operator-wide policy
-- was still live. It was not; this was found live, via /admin/officials
-- returning an empty list for a real admin despite a real appointed
-- official existing.
--
-- Fixed narrowly: admin only, not every operator — a barangay/municipal
-- official still sees only their own row, preserving the 09-11 hardening.
--
-- EXECUTE is granted to `authenticated` (not revoked), matching
-- is_operator()'s own grant shape — migration 20260905073924 already
-- documents why: an RLS policy's USING clause runs AS the querying role,
-- so revoking EXECUTE from authenticated breaks the very policy that
-- calls this function. Confirmed live: revoking it first produced
-- "permission denied for function is_admin" the moment the policy ran.
create or replace function private.is_admin() returns boolean
language sql security definer set search_path = '' stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

drop policy profiles_read_own on public.profiles;
create policy profiles_read_own_or_admin on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()));
