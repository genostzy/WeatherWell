-- Sub-project 1, section 4 and correction 3. Anyone holding the public key
-- could read every water-level report's exact GPS position and reporter id.
-- Postgres ignores a column-level REVOKE while a table-level SELECT grant
-- exists, so the table grant goes and the public columns come back
-- one by one.
revoke select on public.water_level_reports from anon, authenticated;
grant select (id, zone_id, depth_level, reported_at, trust_weight, is_outlier)
  on public.water_level_reports to anon, authenticated;

-- A resident's own reports, for the /resident pages.
create or replace function public.my_water_level_reports()
returns table (id uuid, zone_id text, depth_level text, reported_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.zone_id, r.depth_level, r.reported_at
    from public.water_level_reports r
   where r.reporter_id = (select auth.uid())
   order by r.reported_at desc
$$;
revoke execute on function public.my_water_level_reports() from public, anon;
grant execute on function public.my_water_level_reports() to authenticated;
