-- A queued write keeps the time it was made (spec §2, offline-sending Task 1).
--
-- The outbox can send a report or check-in hours after a resident actually
-- made it, once connectivity returns. Without this, PostgREST's own
-- `reported_at`/`checked_in_at` server-clock defaults (see
-- 20260907073646_harden_write_paths.sql / 20260909120345_task2_review_fixes.sql
-- -- neither column is in the client's INSERT/UPDATE grant today) would stamp
-- the row with the time it finally arrived, not the time it happened -- a
-- flood report queued at 2am and sent at 8am would misreport a six-hour-old
-- water level as current.
--
-- Column grants: `reported_at` is not in water_level_reports' INSERT column
-- grant (`grant insert (id, zone_id, depth_level, reporter_id)`, from
-- 20260908084522_report_client_ids.sql, the most recent INSERT grant on this
-- table) and there is no UPDATE grant on the table at all for authenticated
-- (revoked by 20260909120345_task2_review_fixes.sql, never re-granted) -- so
-- only an INSERT grant on reported_at is needed. `checked_in_at` is not in
-- either the INSERT or UPDATE column grant on evacuation_check_ins
-- (`grant insert (id, zone_id, user_id, status)` /
-- `grant update (id, zone_id, user_id, status)`, both from
-- 20260909120345_task2_review_fixes.sql, the most recent grants on this
-- table) -- confirmed live against information_schema.column_privileges
-- before writing this migration -- so both an INSERT and an UPDATE grant are
-- needed: PostgREST's upsert compiles to INSERT ... ON CONFLICT (zone_id,
-- user_id) DO UPDATE SET <every payload column>, which reaches the UPDATE
-- grant on the conflict path (confirmed live: that path fires the table's
-- BEFORE UPDATE trigger with OLD populated).
grant insert (reported_at) on public.water_level_reports to authenticated;
grant insert (checked_in_at) on public.evacuation_check_ins to authenticated;
grant update (checked_in_at) on public.evacuation_check_ins to authenticated;

-- A report's own reported_at is honest, within limits: a future timestamp
-- (clock skew, a queued write replayed out of order) is clamped to now()
-- rather than trusted outright, and a report claiming to be more than 6
-- hours old is refused -- stale enough that it is no longer useful flood
-- signal, and old enough that a legitimate offline queue should not produce
-- one (the outbox is for short connectivity gaps, not day-old reports).
create or replace function private.honest_report_time()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reported_at is null or new.reported_at > now() then
    new.reported_at := now();
  elsif new.reported_at < now() - interval '6 hours' then
    raise exception 'report too old' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger water_level_reports_honest_time
  before insert on public.water_level_reports
  for each row execute function private.honest_report_time();

-- A check-in's own checked_in_at is honest the same way (future clamped to
-- now()), but with no age cutoff -- a check-in has no staleness limit the
-- way a water-level reading does. The one-directional guard matters more
-- here than for reports: evacuation_check_ins is upserted, not inserted, so
-- a stale queued write replaying out of order after a fresher answer already
-- landed must never regress a resident's current status (e.g. "needs_help"
-- reverting to a "safe" answer that predates it). Comparing new to old is
-- only meaningful on UPDATE -- there is no old row on INSERT.
create or replace function private.honest_check_in_time()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.checked_in_at is null or new.checked_in_at > now() then
    new.checked_in_at := now();
  end if;
  -- An older check-in arriving late never replaces a newer one.
  if tg_op = 'UPDATE' and new.checked_in_at < old.checked_in_at then
    return old;
  end if;
  return new;
end $$;
create trigger evacuation_check_ins_honest_time
  before insert or update on public.evacuation_check_ins
  for each row execute function private.honest_check_in_time();
