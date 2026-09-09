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
