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
