-- Sub-project 1, correction 5. The existing 5-minute de-duplication and
-- 300/hour cap stay; a 5,000-row total cap is added so the table cannot grow
-- past a few tens of MB on the free tier.
create or replace function public.report_app_error(
  p_source text, p_kind text, p_message text, p_stack text,
  p_route text, p_environment text, p_release text, p_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  if (select count(*) from public.app_errors) >= 5000 then
    return;
  end if;

  insert into public.app_errors (source, kind, message, stack, route, environment, release, fingerprint)
  values (p_source, p_kind, left(coalesce(p_message, ''), 500), left(p_stack, 4000),
          left(coalesce(p_route, '/'), 200), p_environment, left(p_release, 64), left(p_fingerprint, 64));
exception when others then
  return;
end;
$$;
