-- Final-review I3 for sub-project 1. app_errors_total_cap REFUSED new errors
-- once 5,000 rows existed. Anyone can call report_app_error, so a flood of
-- distinct fingerprints could fill the table in ~17 hours and stop real
-- errors being recorded for up to 30 days, while /api/health reported
-- "healthy". The table is now a ring buffer: when full, the oldest rows make
-- way for the new one.
create or replace function public.report_app_error(
  p_source text, p_kind text, p_message text, p_stack text,
  p_route text, p_environment text, p_release text, p_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_excess int;
begin
  delete from public.app_errors
   where id in (select id from public.app_errors
                 where occurred_at < now() - interval '30 days' limit 200);

  if p_source not in ('client','server')
     or p_kind not in ('render','unhandled','request')
     or p_environment not in ('production','preview')
     or coalesce(p_fingerprint, '') = '' then
    return;
  end if;

  if exists (select 1 from public.app_errors
              where fingerprint = left(p_fingerprint, 64)
                and occurred_at > now() - interval '5 minutes') then
    return;
  end if;

  if (select count(*) from public.app_errors where occurred_at > now() - interval '1 hour') >= 300 then
    return;
  end if;

  select count(*) - 4999 into v_excess from public.app_errors;
  if v_excess > 0 then
    delete from public.app_errors
     where id in (select id from public.app_errors order by occurred_at asc, id asc limit v_excess);
  end if;

  insert into public.app_errors (source, kind, message, stack, route, environment, release, fingerprint)
  values (p_source, p_kind, left(coalesce(p_message, ''), 500), left(p_stack, 4000),
          left(coalesce(p_route, '/'), 200), p_environment, left(p_release, 64), left(p_fingerprint, 64));
exception when others then
  return;
end;
$$;
