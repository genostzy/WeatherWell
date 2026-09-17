-- Final review, Minor 11: /api/health counted recent app_errors across every
-- environment, so a crash on a preview deployment would fail the production
-- watcher. The count takes an optional environment filter: null (the
-- default) counts every environment, anything else counts only that one.
--
-- Replaced rather than overloaded: a zero-argument function beside a
-- one-argument function whose argument has a default would make the plain
-- zero-argument call ambiguous. With only the defaulted form left, that
-- call keeps working unchanged.
drop function public.recent_app_error_count();

create function public.recent_app_error_count(p_environment text default null) returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::integer
    from public.app_errors
   where occurred_at > now() - interval '15 minutes'
     and (p_environment is null or environment = p_environment)
$$;
revoke execute on function public.recent_app_error_count(text) from public;
grant execute on function public.recent_app_error_count(text) to anon, authenticated, service_role;

-- Final review, Minor 8: the honest-time trigger functions kept Postgres's
-- default PUBLIC EXECUTE. A trigger fires regardless of EXECUTE on its
-- function, so revoking changes nothing for inserts; it matches this
-- repository's other private trigger functions.
revoke execute on function private.honest_report_time() from public, anon, authenticated;
revoke execute on function private.honest_check_in_time() from public, anon, authenticated;
