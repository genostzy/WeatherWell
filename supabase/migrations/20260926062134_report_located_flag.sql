-- Review finding (26 September): the app counted reports sent without a
-- location toward "enough neighbours have reported", but the engine never
-- counts them (check_and_trigger_alerts requires lat and lng). The feed may
-- not carry the position itself (20260923082122_hide_report_locations), so it
-- gets whether there is one: a public flag, never the coordinates.
alter table public.water_level_reports
  add column located boolean generated always as (lat is not null and lng is not null) stored;

grant select (located) on public.water_level_reports to anon, authenticated;
