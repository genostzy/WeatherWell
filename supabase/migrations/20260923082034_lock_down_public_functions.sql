-- Sub-project 1, section 3 and correction 2. Neither function below is
-- called by the app; both were executable by anyone holding the public key.
-- get_push_subscriptions_for_zone returned every subscriber's push endpoint
-- and keys; get_reference_data_compact returned the whole nationwide
-- dataset per call.
drop function if exists public.get_push_subscriptions_for_zone(text);
drop function if exists public.get_reference_data_compact();

-- Scheduled jobs call these with the service-role key; nobody else may.
revoke execute on function public.check_and_trigger_alerts() from public, anon, authenticated;
grant execute on function public.check_and_trigger_alerts() to service_role;

create or replace function public.cleanup_old_weather_readings()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.weather_readings where fetched_at < now() - interval '48 hours';
$$;
revoke execute on function public.cleanup_old_weather_readings() from public, anon, authenticated;
grant execute on function public.cleanup_old_weather_readings() to service_role;
