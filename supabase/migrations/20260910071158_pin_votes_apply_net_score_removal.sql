-- Task 4: net-score pin removal (PRD Anti-Abuse layer 10), now decided by
-- the server's own tally rather than by whichever device happened to reach
-- the threshold first.
--
-- voteOnPin (src/app/actions/vote-on-pin.ts) upserts into pin_votes as the
-- voter -- never as the pin's author. The plan's own sketch for the removal
-- step was a plain `update community_pins set removed = true, removed_reason
-- = 'net_score' ...` issued by that same voter, and a `private`-schema
-- SECURITY DEFINER function "called from the action" if that plain update
-- turned out to be refused.
--
-- Confirmed live, both halves. First, the plain update: a fixture pin
-- authored by A, voted on by B (neither an operator), with the session
-- simulated the way this repo's own RLS suite does it (SET LOCAL ROLE
-- authenticated + a real request.jwt.claims for B) --
--   update community_pins set removed = true, removed_reason = 'net_score'
--   where id = '<A''s pin>'
-- matched zero rows, no error -- pins_update_own_or_operator's USING clause
-- (auth.uid() = author_id or is_operator()) is false for B on every row.
-- Silent, not an exception, exactly as pins_update_own_or_operator's own
-- comment predicts for anybody who isn't the author.
--
-- Second, and this is the part the plan's own text did not anticipate: a
-- `private`-schema function cannot be "called from the action" as an RPC at
-- all. Proved with a real HTTP round trip -- an actual anonymous sign-in
-- (POST /auth/v1/signup), a real access token, then
--   POST /rest/v1/rpc/<private-schema function name>
--   Authorization: Bearer <that token>
-- -- which came back 404 PGRST202, "Could not find the function
-- public.<name>... in the schema cache". PostgREST resolves an RPC name
-- against the exposed ("public") schema only; it never even looks in
-- `private`, independent of any GRANT. (A raw-SQL version of the same call --
-- SET LOCAL ROLE authenticated then `select private.<name>(...)` -- fails
-- one layer earlier still, with 42501 "permission denied for schema
-- private": schema `private` grants no USAGE to `authenticated`, the same
-- invariant supabase/tests/rls.sql already asserts for private.is_operator().)
-- Either way, nothing running as the voter can name this function to call it.
--
-- So the fix is a `private` SECURITY DEFINER function, as the plan says, but
-- reached the way every other `private.*` function in this database already
-- is: from a trigger, not a client-issued call. pin_votes_apply_net_score_removal
-- below fires on the write voteOnPin is already allowed to make (the upsert
-- into pin_votes itself), so it is "called from the action" in the sense
-- that actually reaches the table -- as a side effect of that request, in the
-- same transaction, rather than as a second round trip the voter's own role
-- could never place. Postgres resolves and privilege-checks a trigger's
-- function at CREATE TRIGGER time (like a policy expression, not like a
-- client-issued call), so the missing USAGE that blocks a direct call never
-- comes into it.
--
-- Confirmed live a third time, for the mechanism itself: as the voter (same
-- SET LOCAL ROLE + request.jwt.claims simulation), five distinct non-author,
-- non-operator downvotes on one pin, cast one INSERT at a time, left the pin
-- untouched at a margin of 4 (removed = false) and removed it
-- (removed = true, removed_reason = 'net_score') the instant the fifth
-- landed -- with the trigger function running SECURITY DEFINER the whole
-- time, never once as the voter.

-- language plpgsql, not sql: a trigger function must return the `trigger`
-- pseudo-type and read NEW, which only a procedural language can do here.
-- The body below names no private.* function -- it only touches
-- public.pin_votes and public.community_pins -- so the plpgsql
-- lazy-name-resolution trap Ruling 2 warns about (the exact shape
-- 20260909080337 fixed for pins_protect_moderation_columns) does not apply:
-- there is no private.* name inside this body for a fresh `authenticated`
-- connection to fail resolving.
create or replace function private.apply_net_score_removal() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pin_upvotes bigint;
  pin_downvotes bigint;
begin
  select
    count(*) filter (where direction = 1),
    count(*) filter (where direction = -1)
  into pin_upvotes, pin_downvotes
  from public.pin_votes
  where pin_id = new.pin_id;

  -- Threshold 5, the same margin src/lib/community-pin.ts's
  -- NET_SCORE_REMOVAL_THRESHOLD names for exceedsRemovalThreshold and for
  -- voteOnPin's own best-effort attempt at this same write. SQL cannot
  -- import that TypeScript constant, so this is a second copy of the value,
  -- kept in step by hand -- not by anything mechanical.
  --
  -- `and not removed` makes this idempotent against replay (an outbox retry
  -- re-upserting the same direction recomputes the same tally and would
  -- otherwise re-run this write for no reason) and, deliberately, never
  -- overwrites an operator's own removal: once a pin is removed for any
  -- reason, later votes cannot flip its removed_reason from 'admin' to
  -- 'net_score' and erase the operator's record underneath them.
  if pin_downvotes - pin_upvotes >= 5 then
    update public.community_pins
    set removed = true, removed_reason = 'net_score'
    where id = new.pin_id and not removed;
  end if;

  return new;
end $$;

-- Defence in depth, same reasoning as private.deny_pin_moderation_write()
-- and private.handle_new_user(): the trigger manager invokes this function
-- without any runtime EXECUTE check, so this revoke does not disable the
-- trigger -- it closes the (already unreachable, per the evidence above --
-- neither RPC nor raw SQL can name this function as `authenticated`) path of
-- calling it directly as a query.
--
-- EXECUTE stays granted to `authenticated` -- not because anything calls it
-- that way today, but to match the settled precedent private.is_operator()
-- set (20260905073924, and reaffirmed by 20260909080337 after a draft that
-- revoked it broke policy evaluation): the schema's own missing USAGE grant
-- is the real protection, so narrowing EXECUTE beyond public/anon buys
-- nothing today and risks the same breakage tomorrow, the moment anything
-- else in `private` comes to depend on this function while running as
-- `authenticated`.
revoke execute on function private.apply_net_score_removal()
  from public, anon;
grant execute on function private.apply_net_score_removal() to authenticated;

create trigger pin_votes_apply_net_score_removal
  after insert or update on public.pin_votes
  for each row execute function private.apply_net_score_removal();
