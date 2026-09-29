-- Exact request limits, counted in the database so every server instance
-- shares one count. /api/route's in-memory limits (src/lib/rate-limit.ts)
-- count per instance, and production runs more than one, so on 29 September
-- the real limits were a few times the stated ones. The route keeps its
-- in-memory limits as a first line, so a flood never reaches this table.
-- Windows are fixed and aligned to the epoch.

-- In private, which the API does not expose. A key names what is counted; the
-- route keeps a caller's address only as a keyed hash.
create table private.rate_limit_counts (
  key text not null,
  window_start timestamptz not null,
  count int not null,
  primary key (key, window_start)
);

-- Counts one request against p_key and says whether it is within p_max for the
-- current window of p_window_seconds. Only the server calls it.
create or replace function public.take_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count int;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_max is null or p_max < 0 then
    raise exception 'take_rate_limit: bad limit (% in % s)', p_max, p_window_seconds;
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limit_counts as c (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = c.count + 1
  returning c.count into v_count;
  return v_count <= p_max;
end;
$$;

revoke execute on function public.take_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.take_rate_limit(text, int, int) to service_role;

-- Windows over an hour old go every hour.
select cron.schedule('rate-limit-cleanup', '7 * * * *',
  $$delete from private.rate_limit_counts where window_start < now() - interval '1 hour'$$);
