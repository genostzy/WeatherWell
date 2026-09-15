create table public.app_errors (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  source      text not null check (source in ('client','server')),
  kind        text not null check (kind in ('render','unhandled','request')),
  message     text not null check (char_length(message) <= 500),
  stack       text check (char_length(stack) <= 4000),
  route       text not null check (char_length(route) <= 200),
  environment text not null check (environment in ('production','preview')),
  release     text check (char_length(release) <= 64),
  fingerprint text not null check (char_length(fingerprint) <= 64)
);
create index app_errors_time on public.app_errors (occurred_at desc);
create index app_errors_fingerprint_time on public.app_errors (fingerprint, occurred_at desc);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

-- The only writer. Never raises at the caller: monitoring must not become a
-- second error. Dedupes, caps volume, and trims old rows as it goes.
create or replace function public.report_app_error(
  p_source text, p_kind text, p_message text, p_stack text,
  p_route text, p_environment text, p_release text, p_fingerprint text
) returns void
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

  insert into public.app_errors (source, kind, message, stack, route, environment, release, fingerprint)
  values (p_source, p_kind, left(coalesce(p_message, ''), 500), left(p_stack, 4000),
          left(coalesce(p_route, '/'), 200), p_environment, left(p_release, 64), left(p_fingerprint, 64));
exception when others then
  return;
end;
$$;
revoke execute on function public.report_app_error(text,text,text,text,text,text,text,text) from public;
grant execute on function public.report_app_error(text,text,text,text,text,text,text,text) to anon, authenticated;

create or replace function public.recent_app_error_count() returns integer
language sql
security definer
set search_path = ''
stable
as $$ select count(*)::integer from public.app_errors where occurred_at > now() - interval '15 minutes' $$;
revoke execute on function public.recent_app_error_count() from public;
grant execute on function public.recent_app_error_count() to anon, authenticated;
