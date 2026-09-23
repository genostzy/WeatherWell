-- TEMPORARY. hide_report_locations went live before the app code that stops
-- selecting reporter_id was deployed, so the live /api/reports failed with
-- "permission denied". GPS (lat, lng) stays hidden; only reporter_id is
-- readable again until the new code is deployed, then a follow-up migration
-- revokes it.
grant select (reporter_id) on public.water_level_reports to anon, authenticated;
