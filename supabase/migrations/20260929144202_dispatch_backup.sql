-- Supabase starts the weekly backup (backup.yml) on time, as it starts the
-- other workflows (20260925135257_schedule_workflows_from_supabase). GitHub
-- also turns off a public repository's own schedules after 60 days without a
-- commit; a dispatched run does not depend on that. The workflow keeps its own
-- schedule as a fallback; a second copy in a week is harmless.
select cron.schedule('dispatch-backup', '30 18 * * 0', $$select private.dispatch_workflow('backup.yml')$$);
