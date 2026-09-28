import type { LocalizedText } from "./types";

export type PinStatusTag =
  | "flooded"
  | "rising"
  | "receding"
  | "impassable"
  | "road_blocked"
  | "landslide"
  | "power_line_down"
  | "other";

/** What a pin is about. A flood pin also says what the water is doing (its tag); the others are their own tag. */
export type PinKind = "flood" | "road_blocked" | "landslide" | "power_line_down" | "other";

export const PIN_KIND_ORDER: PinKind[] = ["flood", "road_blocked", "landslide", "power_line_down", "other"];

export const FLOOD_STATUS_TAGS: PinStatusTag[] = ["flooded", "rising", "receding", "impassable"];

export const PIN_STATUS_ORDER: PinStatusTag[] = [...FLOOD_STATUS_TAGS, "road_blocked", "landslide", "power_line_down", "other"];

export function pinKindOf(tag: PinStatusTag): PinKind {
  return FLOOD_STATUS_TAGS.includes(tag) ? "flood" : (tag as Exclude<PinKind, "flood">);
}

export const PIN_KIND_LABEL: Record<PinKind, LocalizedText> = {
  flood: { en: "Flood", fil: "Baha" },
  road_blocked: { en: "Road blocked", fil: "Sarado ang daan" },
  landslide: { en: "Landslide", fil: "Pagguho ng lupa" },
  power_line_down: { en: "Power line down", fil: "Bumagsak na kawad ng kuryente" },
  other: { en: "Other", fil: "Iba pa" },
};

export const PIN_STATUS_LABEL: Record<PinStatusTag, LocalizedText> = {
  flooded: { en: "Flooded", fil: "Baha" },
  rising: { en: "Rising", fil: "Tumataas" },
  receding: { en: "Receding", fil: "Bumababa" },
  impassable: { en: "Impassable", fil: "Hindi Madaanan" },
  road_blocked: PIN_KIND_LABEL.road_blocked,
  landslide: PIN_KIND_LABEL.landslide,
  power_line_down: PIN_KIND_LABEL.power_line_down,
  other: PIN_KIND_LABEL.other,
};

/** Distinct from the official severity palette (yellow/orange/red/evacuate) — pins are a clearly-labeled, unverified community layer, never confused with an official Alert. */
export const PIN_STATUS_COLOR: Record<PinStatusTag, string> = {
  flooded: "#2563eb",
  rising: "#f97316",
  receding: "#0f766e",
  impassable: "#991b1b",
  road_blocked: "#7c2d12",
  landslide: "#854d0e",
  power_line_down: "#7e22ce",
  other: "#475569",
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

// PRD Anti-Abuse layer 10's automatic-removal margin used to be a constant
// and predicate here (NET_SCORE_REMOVAL_THRESHOLD / exceedsRemovalThreshold).
// Both are gone — the rule now lives solely in Postgres, as the trigger
// `private.apply_net_score_removal` defined by
// supabase/migrations/20260910071158_pin_votes_apply_net_score_removal.sql,
// which fires on every `pin_votes` write and removes the pin atomically as
// part of that same write. Nothing on the client or in `voteOnPin`
// (src/app/actions/vote-on-pin.ts) computes this any more — if a pin
// disappeared, that migration is where the rule is written down. Coverage
// for the margin lives in supabase/tests/rls.sql, not a TypeScript test.
