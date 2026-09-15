"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

/** Postgres SQLSTATEs this action must not keep retrying. */
const INSUFFICIENT_PRIVILEGE = "42501";
const CHECK_VIOLATION = "23514";
/** TRANSIENT here — see classify() below, the opposite of every other action in this app. */
const FOREIGN_KEY_VIOLATION = "23503";

/** Same argument submitWaterLevelReport.ts and pins.ts make, for the same reason. */
const NO_SESSION: ActionResult = {
  ok: false,
  permanent: false,
  error: "No session yet — cannot attribute this vote. Will retry.",
};

/**
 * getClaims, never getSession: it verifies the JWT signature against the
 * project's published keys. getSession does not revalidate and a spoofed
 * cookie would pass it.
 */
async function callerId(
  supabase: Awaited<ReturnType<typeof createSupabaseUserClient>>
): Promise<string | undefined> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub;
}

/**
 * `23503` is TRANSIENT here, unlike every other action in this file's
 * siblings. A vote's `pin_id` carries a foreign key to `community_pins`, and
 * a resident who drops a pin and votes on it with no signal queues both
 * writes in one outbox — the vote can reach the server a moment before its
 * own pin if the drain interleaves them. Classifying that permanent, the way
 * a bad FK correctly is everywhere else, would bin the vote for good the
 * instant that ordering happens; on the next drain the pin will already be
 * there and the same vote will go through.
 */
function classify(error: { code?: string; message?: string }): ActionResult {
  if (error.code === FOREIGN_KEY_VIOLATION) {
    return { ok: false, permanent: false, error: error.message ?? "Referenced pin is not here yet. Will retry." };
  }
  const permanent = error.code === INSUFFICIENT_PRIVILEGE || error.code === CHECK_VIOLATION;
  return { ok: false, permanent, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}

export interface VoteOnPinInput {
  pinId: string;
  direction: 1 | -1;
}

/**
 * Casts (or changes) this resident's vote on a pin — PRD Anti-Abuse layer 10,
 * one vote per resident per pin, tallied by the server rather than guessed at
 * per device.
 *
 * **Upserts, does not insert.** `pin_votes`' primary key is `(pin_id,
 * voter_id)`, and a resident is allowed to change their mind — a second write
 * from the same voter on the same pin is a legitimate change of direction,
 * not a duplicate. createPin's rule ("23505 is success, because a replayed
 * insert under the same id is the same row") does not transfer: a collision
 * here is not a replay, it is a real second write, and reporting it as
 * success the way createPin does would silently discard the new direction.
 * Upserting on the exact conflict target sidesteps the question rather than
 * answering it differently — there is no 23505 branch below because this
 * shape does not raise one when it hits an existing row; it updates it.
 *
 * `onConflict: "pin_id,voter_id"` is required, not decorative: Task 2 left
 * exactly `(pin_id, voter_id, direction)` insertable and `(pin_id, voter_id,
 * direction)` updatable — the shape PostgREST's `Prefer: merge-duplicates`
 * actually emits for this payload (every column, not just the one that
 * changed) — so naming any other conflict target, or none, is refused.
 */
export async function voteOnPin(input: VoteOnPinInput): Promise<ActionResult> {
  // Validation failures are permanent by definition, checked before the
  // database is even touched: a direction that is neither 1 nor -1 cannot
  // become valid by being sent again.
  if (input.direction !== 1 && input.direction !== -1) {
    return { ok: false, permanent: true, error: `Vote direction must be 1 or -1, got ${input.direction}.` };
  }

  const supabase = await createSupabaseUserClient();
  const userId = await callerId(supabase);
  if (!userId) return NO_SESSION;

  const { error } = await supabase.from("pin_votes").upsert(
    {
      pin_id: input.pinId,
      // The caller's own uid, verified, never one supplied by the client —
      // votes_insert_own and votes_update_own enforce this too, but a client
      // that never even sends a foreign voter_id is one fewer thing RLS has
      // to catch.
      voter_id: userId,
      direction: input.direction,
    },
    { onConflict: "pin_id,voter_id" }
  );

  if (error) return classify(error);

  // Layer 10's automatic removal happens here too, but not as anything this
  // action computes or writes: `pin_votes_apply_net_score_removal`, a
  // trigger on `pin_votes` (see the migration of the same name), recomputes
  // the tally and removes the pin as a side effect of the upsert above,
  // already inside this same request, running as the table's owner rather
  // than as this voter — which is the only way it can work at all, since
  // RLS's pins_update_own_or_in_area refuses a direct UPDATE from anyone
  // but the pin's own author or an official for its area (silently, zero rows, no error) and PostgREST
  // will not even resolve an RPC into schema `private` for this voter to
  // call instead. See `src/lib/community-pin.ts` for where the threshold
  // itself is defined.

  return { ok: true };
}
