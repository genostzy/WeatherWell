-- The rain heads-up on time: pg_cron starts rain-forecast.yml at five past
-- every hour, as it starts the other workflows (20260925135257). Applied at
-- the release (1 October), once /api/rain-forecast was in production.
select cron.schedule('dispatch-rain-forecast', '5 * * * *', $$select private.dispatch_workflow('rain-forecast.yml')$$);
