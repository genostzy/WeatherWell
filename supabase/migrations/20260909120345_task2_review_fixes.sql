-- Task 2, fix round 1: close the two single-layer gaps the reviewer found
-- (I-1 / M-1) and widen the upsert-conflict UPDATE grants to the shape
-- PostgREST actually emits for supabase-js .upsert() (I-2). M-2 and M-4 are
-- fixed in supabase/tests/rls.sql and in the comment below respectively, not
-- here.
--
-- I-1 / M-1: 20260909080337 revoked INSERT/UPDATE from `authenticated` only,
-- leaving `anon` holding table-level INSERT and UPDATE on nine tables, and
-- left DELETE granted to both roles on all ten tables this migration touches
-- even though no DELETE policy exists anywhere (the app only ever soft-
-- deletes via UPDATE removed = true). RLS refuses all of it today — no write
-- policy names `anon`, and an unpolicied DELETE matches zero rows — but that
-- migration's own stated principle, repeated three times, is that a
-- privilege should not exist at only one of the two independent layers.
-- Applying it to one role was the gap; 20260907073646 already used
-- `revoke ... from anon, authenticated` for exactly this reason. Every
-- existing `grant ... to authenticated` below is unchanged from
-- 20260909080337 except where I-2 widens it (noted inline).

revoke insert, update, delete on public.community_pins from anon, authenticated;
grant insert (id, zone_id, status_tag, caption, lat, lng, author_id)
  on public.community_pins to authenticated;
grant update (status_tag, caption, removed, removed_reason)
  on public.community_pins to authenticated;

-- I-2: supabase-js `.upsert({ pin_id, voter_id, direction },
-- { onConflict: "pin_id,voter_id" })` compiles, via PostgREST, to
-- `insert ... on conflict (pin_id, voter_id) do update set pin_id =
-- excluded.pin_id, voter_id = excluded.voter_id, direction =
-- excluded.direction` — every payload column, not only the one that
-- changed. 20260909080337 granted UPDATE on `direction` alone, so that DO
-- UPDATE SET clause was refused with 42501 on every re-vote, and the
-- calling action classifies 42501 as a permanent failure — a resident's
-- vote would be dropped for good. Widening UPDATE to the conflict-target
-- columns costs nothing in exposure: pin_votes' own UPDATE policy,
-- votes_update_own, carries `with check ((select auth.uid()) = voter_id)`,
-- so a widened grant still
-- cannot move a vote onto someone else's identity or attach it to a
-- different pin under a false voter_id — RLS refuses that regardless of
-- which columns the grant allows. Proven live below with a real PostgREST
-- round trip (not raw SQL, which does not emit the same column list — see
-- the fix report).
revoke insert, update, delete on public.pin_votes from anon, authenticated;
grant insert (pin_id, voter_id, direction) on public.pin_votes to authenticated;
grant update (pin_id, voter_id, direction) on public.pin_votes to authenticated;

-- I-2, same reasoning, but with one more column than the conflict target:
-- the plan's call is .upsert({ id, zone_id, user_id, status },
-- { onConflict: "zone_id,user_id" }) -- `id` rides along in the payload
-- even though it isn't part of the conflict target. PostgREST's DO UPDATE
-- SET clause covers every payload column, not just the conflict target, so
-- granting UPDATE on only (zone_id, user_id, status) still 42501s on `id`.
-- Proven live: the first cut of this fix (matching the conflict-target-only
-- wording literally) was round-tripped through real PostgREST and failed
-- with `permission denied for table evacuation_check_ins` on BOTH branches
-- (not just the DO UPDATE one), because merge-duplicates always compiles to
-- INSERT ... ON CONFLICT ... DO UPDATE regardless of whether a row exists
-- yet. Adding `id` to the grant fixed both branches -- see the fix report
-- for the request/response evidence. checkins_update_own's WITH CHECK is
-- `(select auth.uid()) = user_id`, so none of this widening lets a caller
-- reassign a check-in to another person -- confirmed live: an upsert whose
-- payload changes `user_id` to someone else is refused by RLS (42501, "new
-- row violates row-level security policy"), not silently allowed.
revoke insert, update, delete on public.evacuation_check_ins from anon, authenticated;
grant insert (id, zone_id, user_id, status) on public.evacuation_check_ins to authenticated;
grant update (id, zone_id, user_id, status) on public.evacuation_check_ins to authenticated;

revoke insert, update, delete on public.alerts from anon, authenticated;
grant insert (id, zone_id, severity, message, source, confidence,
              predicted_timing, superseded_severity)
  on public.alerts to authenticated;
grant update (is_active, superseded_at) on public.alerts to authenticated;

-- No INSERT/UPDATE policy exists on profiles; role is not self-assignable,
-- and now that is true at both layers for both roles.
revoke insert, update, delete on public.profiles from anon, authenticated;

-- water_level_reports.INSERT already had `anon` revoked by 20260907073646;
-- only UPDATE (revoked from `authenticated` only by 20260909080337) and
-- DELETE (never revoked from either role) needed widening here.
revoke update, delete on public.water_level_reports from anon, authenticated;

revoke insert, update, delete on public.zones from anon, authenticated;
revoke insert, update, delete on public.points_of_interest from anon, authenticated;
revoke insert, update, delete on public.hazard_susceptibility from anon, authenticated;

revoke insert, update, delete on public.evacuation_centers from anon, authenticated;
grant update (status, current_occupancy) on public.evacuation_centers to authenticated;
