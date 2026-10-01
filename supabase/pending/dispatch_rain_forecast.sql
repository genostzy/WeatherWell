-- The rain heads-up on time: pg_cron starts rain-forecast.yml at five past
-- every hour, as it starts the other workflows (20260925135257). Applied at
-- the release, once /api/rain-forecast is in production; the file then
-- moves to supabase/migrations under the version apply_migration reports.
select cron.schedule('dispatch-rain-forecast', '5 * * * *', $$select private.dispatch_workflow('rain-forecast.yml')$$);
