-- Supabase starts the scheduled GitHub workflows on time.
--
-- GitHub delays scheduled workflows on its free runners by hours. Measured on
-- 25 September: the 15-minute monitor ran every 3 to 5 hours, and the 3-hour
-- threshold check and typhoon refresh every 5 to 8 hours, while a typhoon
-- was active. pg_cron runs on time, so it now asks GitHub to run both
-- workflows through workflow_dispatch, which GitHub starts at once. The
-- workflows keep their own schedules as a fallback; a duplicate run is
-- harmless.
--
-- The request needs a GitHub token that may run this repository's workflows
-- (a fine-grained token with Actions: read and write). The owner stores it in
-- Vault as `github_workflow_token`. Until it is there, each run logs a
-- warning and does nothing.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function private.dispatch_workflow(p_workflow text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'github_workflow_token';
  if v_token is null then
    raise warning 'dispatch_workflow(%): no github_workflow_token in Vault', p_workflow;
    return;
  end if;
  perform net.http_post(
    url := 'https://api.github.com/repos/genostzy/WeatherWell/actions/workflows/' || p_workflow || '/dispatches',
    body := jsonb_build_object('ref', 'v1'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'weatherwell-pg-cron',
      'X-GitHub-Api-Version', '2022-11-28'
    )
  );
end $$;

revoke execute on function private.dispatch_workflow(text) from public, anon, authenticated;

-- The workflows' own cadence (monitor.yml, threshold-check.yml).
select cron.schedule('dispatch-monitor', '*/15 * * * *', $$select private.dispatch_workflow('monitor.yml')$$);
select cron.schedule('dispatch-threshold-check', '0 */3 * * *', $$select private.dispatch_workflow('threshold-check.yml')$$);
