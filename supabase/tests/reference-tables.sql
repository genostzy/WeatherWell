begin;

do $$
begin
  if to_regclass('public.zones') is null then
    raise exception using errcode = 'TSTFL', message = 'public.zones does not exist';
  end if;
  if to_regclass('public.evacuation_centers') is null then
    raise exception using errcode = 'TSTFL', message = 'public.evacuation_centers does not exist';
  end if;
  if to_regclass('public.points_of_interest') is null then
    raise exception using errcode = 'TSTFL', message = 'public.points_of_interest does not exist';
  end if;
  if to_regclass('public.hazard_susceptibility') is null then
    raise exception using errcode = 'TSTFL', message = 'public.hazard_susceptibility does not exist';
  end if;
end $$;

-- RLS must be on. A table in public without RLS is world-writable via the Data API.
do $$
declare unprotected text;
begin
  select string_agg(relname, ', ') into unprotected
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if unprotected is not null then
    raise exception using errcode = 'TSTFL',
      message = format('tables in public without RLS: %s', unprotected);
  end if;
end $$;

rollback;
