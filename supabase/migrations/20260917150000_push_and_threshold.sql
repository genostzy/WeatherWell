-- ============================================================
-- Sub-project 1.5: Push subscriptions + threshold alert engine
-- ============================================================

-- Push subscriptions: stores Web Push subscriptions per user.
-- One user can have multiple subscriptions (multiple devices/browsers).
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  zone_id         text references public.zones (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One subscription endpoint per user (deduplicate re-subscribes)
create unique index push_subscriptions_user_endpoint_idx
  on public.push_subscriptions (user_id, endpoint);

-- Index for "all subscriptions for a zone" queries
create index push_subscriptions_zone_idx
  on public.push_subscriptions (zone_id) where zone_id is not null;

alter table public.push_subscriptions enable row level security;

-- Users can read/update/delete their own subscriptions
create policy "Users can manage their own subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can insert (for server-side subscription storage)
create policy "Service role can insert subscriptions"
  on public.push_subscriptions for insert
  to service_role
  with check (true);

-- Service role can read all subscriptions (for push delivery)
create policy "Service role can read all subscriptions"
  on public.push_subscriptions for select
  to service_role
  using (true);

-- Service role can delete stale subscriptions
create policy "Service role can delete subscriptions"
  on public.push_subscriptions for delete
  to service_role
  using (true);

-- ============================================================
-- Threshold alert engine: Postgres function
-- ============================================================

-- Configuration: minimum reports, time window, depth threshold
-- These could be made per-zone in the future, but start global.
create or replace function public.check_and_trigger_alerts()
returns table (
  zone_id text,
  severity text,
  report_count bigint,
  triggered boolean
)
language plpgsql
security definer
as $$
declare
  v_min_reports constant int := 3;
  v_window_hours constant int := 6;
  v_depth_threshold constant text := 'ankle'; -- trigger at ankle or deeper
  v_depth_order text[] := array['dry', 'ankle', 'knee', 'waist', 'neck'];
  v_zone record;
  v_report_count bigint;
  v_avg_depth_index numeric;
  v_severity text;
  v_message jsonb;
begin
  -- For each zone with reports in the window
  for v_zone in
    select distinct r.zone_id
    from public.water_level_reports r
    where r.reported_at >= now() - make_interval(hours := v_window_hours)
      and not r.is_outlier
  loop
    -- Count distinct reporters
    select count(distinct r.reporter_id) into v_report_count
    from public.water_level_reports r
    where r.zone_id = v_zone.zone_id
      and r.reported_at >= now() - make_interval(hours := v_window_hours)
      and not r.is_outlier;

    -- Check minimum reports from different devices
    if v_report_count < v_min_reports then
      zone_id := v_zone.zone_id;
      severity := null;
      report_count := v_report_count;
      triggered := false;
      return next;
      continue;
    end if;

    -- Calculate average depth index
    select avg(
      case r.depth_level
        when 'dry' then 1
        when 'ankle' then 2
        when 'knee' then 3
        when 'waist' then 4
        when 'neck' then 5
      end
    ) into v_avg_depth_index
    from public.water_level_reports r
    where r.zone_id = v_zone.zone_id
      and r.reported_at >= now() - make_interval(hours := v_window_hours)
      and not r.is_outlier;

    -- Map average depth to severity
    if v_avg_depth_index >= 4 then
      v_severity := 'evacuate';
    elsif v_avg_depth_index >= 3 then
      v_severity := 'red';
    elsif v_avg_depth_index >= 2 then
      v_severity := 'orange';
    else
      v_severity := 'yellow';
    end if;

    -- Generate localized message
    v_message := jsonb_build_object(
      'en', 'Auto-triggered: ' || v_report_count || ' crowd reports indicate ' || v_severity || ' level flooding.',
      fil, 'Auto-triggered: ' || v_report_count || ' na ulat ng komunidad ay nagpapahiwatig ng ' || v_severity || ' na pagbaha.'
    );

    -- Call set_zone_alert with auto_crowdsourced source
    perform public.set_zone_alert(
      v_zone.zone_id,
      v_severity,
      v_message,
      'auto_crowdsourced'
    );

    zone_id := v_zone.zone_id;
    severity := v_severity;
    report_count := v_report_count;
    triggered := true;
    return next;
  end loop;
end;
$$;

-- ============================================================
-- Push delivery function: sends push to all subscribers for a zone
-- ============================================================

-- This function is called by the API route using the web-push library.
-- It returns the list of subscriptions to send to.
create or replace function public.get_push_subscriptions_for_zone(p_zone_id text)
returns table (
  endpoint text,
  p256dh text,
  auth text
)
language sql
security definer
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.zone_id = p_zone_id
     or s.zone_id is null; -- Send to all subscribers if no zone specified
$$;

grant execute on function public.get_push_subscriptions_for_zone(text) to service_role;
grant execute on function public.check_and_trigger_alerts() to service_role;
