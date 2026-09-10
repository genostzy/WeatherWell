import type { LocalizedText } from "./types";

export type PinStatusTag = "flooded" | "rising" | "receding" | "impassable";

export const PIN_STATUS_ORDER: PinStatusTag[] = ["flooded", "rising", "receding", "impassable"];

export const PIN_STATUS_LABEL: Record<PinStatusTag, LocalizedText> = {
  flooded: { en: "Flooded", fil: "Baha" },
  rising: { en: "Rising", fil: "Tumataas" },
  receding: { en: "Receding", fil: "Bumababa" },
  impassable: { en: "Impassable", fil: "Hindi Madaanan" },
};

/** Distinct from the official severity palette (yellow/orange/red/evacuate) — pins are a clearly-labeled, unverified community layer, never confused with an official Alert. */
export const PIN_STATUS_COLOR: Record<PinStatusTag, string> = {
  flooded: "#2563eb",
  rising: "#f97316",
  receding: "#0f766e",
  impassable: "#991b1b",
};

/**
 * Why a pin is hidden from the public map. Lives here rather than in
 * community-pins.ts because the row → pin mapper (pins-mapper.ts) needs it on
 * the server and community-pins.ts is a `"use client"` module.
 *
 * NULL is the third, unnamed case and it is a real one: a pin removed with no
 * reason was withdrawn by its own author. Neither of these two codes describes
 * that — both are moderation verdicts — and the database's CHECK constraint
 * allows only these two, so the author's own withdrawal is recorded by the
 * absence of a reason. See deleteOwnPin in src/app/actions/pins.ts.
 */
export type PinRemovalReason = "net_score" | "admin";

/**
 * PRD Anti-Abuse layer 10's automatic-removal margin: downvotes must beat
 * upvotes by this much before a pin is pulled. A margin, not a raw downvote
 * count, so a well-corroborated pin (say 4 up / 8 down — net 4) survives a
 * handful of bad-faith downvotes the way a lopsided one (0 up / 5 down — net
 * 5) does not.
 *
 * Not exported on its own: `exceedsRemovalThreshold` below is the interface
 * its one consumer, `voteOnPin` (src/app/actions/vote-on-pin.ts), actually
 * needs — nothing outside this file needs the bare number, and knip flags an
 * export nothing imports as dead code.
 *
 * The Postgres trigger that actually performs the removal,
 * `private.apply_net_score_removal` (see the migration of the same name),
 * cannot import a TypeScript constant either way, so its literal `5` is a
 * second copy, called out there as such — this is still the one place the
 * *value* is decided; the trigger's copy must be kept in step with it by
 * hand.
 *
 * Not read by any client component. The previous task deleted the
 * client-side threshold this replaced: a verdict computed on one device
 * against that device's own partial view of the votes gave a different
 * answer per device, and the tally belongs to the server now. See
 * `voteOnPin` in src/lib/community-pins.ts for why the client still queues
 * its vote optimistically without ever computing this threshold itself.
 */
const NET_SCORE_REMOVAL_THRESHOLD = 5;

/**
 * Pure predicate over a pin's tally — no store, no network, so it is cheap to
 * unit-test on the exact margin (PRD Anti-Abuse layer 10) rather than on a
 * raw downvote count. Exported for `voteOnPin` (its production consumer) and
 * for this file's own tests; see `NET_SCORE_REMOVAL_THRESHOLD` above for why
 * the client is not a third.
 */
export function exceedsRemovalThreshold(tally: { upvotes: number; downvotes: number }): boolean {
  return tally.downvotes - tally.upvotes >= NET_SCORE_REMOVAL_THRESHOLD;
}
