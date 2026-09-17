-- Fix round 1 (task-1-review.md, load-bearing finding 1): honest_check_in_time()
-- had no lower bound at all on checked_in_at, so a resident could use a direct
-- PostgREST call to make their own live needs_help check-in display as
-- arbitrarily stale to officials -- the older-than-stored guard only stops a
-- backdated write from overwriting or suppressing a NEWER one already
-- stored; it says nothing about how old a fresh row's own claimed time may
-- be. Bound it to 3 days, mirroring the outbox's own give-up window (spec
-- §2: after 10 attempts, or 3 days since queuedAt, the status becomes
-- stuck) -- no legitimately queued check-in can ever be older than that, so
-- the bound costs nothing against real traffic. Reuses errcode 22023 and the
-- same "too old" shape as honest_report_time(), per this round's ruling
-- (R3) -- record-check-in.ts tells the two apart by message text, not
-- SQLSTATE, because (unlike the report action) a check-in refusal must NOT
-- carry reason: "too_old" (that badge copy is report-specific).
create or replace function private.honest_check_in_time()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.checked_in_at is null or new.checked_in_at > now() then
    new.checked_in_at := now();
  elsif new.checked_in_at < now() - interval '3 days' then
    raise exception 'check-in too old' using errcode = '22023';
  end if;
  -- An older check-in arriving late never replaces a newer one.
  if tg_op = 'UPDATE' and new.checked_in_at < old.checked_in_at then
    return old;
  end if;
  return new;
end $$;
