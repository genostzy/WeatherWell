-- Important 2: an author may edit their own pin's content, but only an
-- operator may change removed/removed_reason. Column-level GRANT UPDATE
-- cannot express this split: residents and operators are both the same
-- `authenticated` Postgres role (Supabase distinguishes them only via
-- profiles.role, read through private.is_operator()), and GRANT is a
-- per-role privilege with no visibility into row data. A BEFORE UPDATE
-- trigger comparing OLD/NEW directly is the mechanism that can. Roles with
-- BYPASSRLS (postgres, service_role) are exempt, mirroring how RLS policies
-- themselves already treat those roles — they can already write any column
-- directly, so this exemption does not open a new path, it just avoids the
-- trigger fighting privileged/administrative writes (e.g. fixture setup,
-- future admin tooling) that RLS itself never gated.
create or replace function private.enforce_pin_moderation_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.removed is distinct from old.removed
      or new.removed_reason is distinct from old.removed_reason)
     and not (select private.is_operator())
     and not (select rolbypassrls from pg_catalog.pg_roles where rolname = current_user) then
    raise exception using errcode = '42501',
      message = 'only an operator may change removed or removed_reason on a pin';
  end if;
  return new;
end $$;

-- Defence in depth, same reasoning as private.handle_new_user(): trigger
-- functions are invoked by the trigger manager, not via a direct call
-- requiring the invoking role's EXECUTE privilege, so this revoke does not
-- disable the trigger. It just closes the (currently unreachable) path of
-- someone calling the function directly as a query.
revoke execute on function private.enforce_pin_moderation_columns()
  from public, anon, authenticated, service_role;

create or replace trigger pins_protect_moderation_columns
  before update on public.community_pins
  for each row
  execute function private.enforce_pin_moderation_columns();

-- Important 3: trust_weight, is_outlier and reported_at feed the weighted-
-- consensus engine and must not be client-settable. reports_insert_own only
-- ever checked reporter_id; the table-level INSERT grant let a client set
-- any column. Revoke the blanket grant (Supabase's platform default) and
-- re-grant column-scoped so the rest take their defaults.
revoke insert on public.water_level_reports from anon, authenticated;
grant insert (zone_id, depth_level, reporter_id)
  on public.water_level_reports to authenticated;

-- Minor 10: TRUNCATE ignores RLS entirely (it is not a DML statement RLS
-- policies apply to), so the platform's blanket TRUNCATE grant is a real
-- bypass in principle even though PostgREST never issues TRUNCATE today.
revoke truncate on all tables in schema public from anon, authenticated;
