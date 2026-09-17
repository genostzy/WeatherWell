import type { CenterStatus } from "./types";
import type { LocalizedText } from "./types";

export const CENTER_STATUS_LABEL: Record<CenterStatus, LocalizedText> = {
  space_available: { en: "Space available", fil: "May espasyo" },
  limited: { en: "Limited space", fil: "Kakaunting espasyo" },
  full: { en: "Full", fil: "Puno na" },
  unknown: { en: "Status unknown", fil: "Hindi alam ang status" },
};

export const CENTER_STATUS_CLASS: Record<CenterStatus, string> = {
  space_available: "bg-green-500/20 text-green-400",
  limited: "bg-yellow-500/20 text-yellow-400",
  full: "bg-red-500/20 text-red-400",
  unknown: "bg-gray-500/20 text-gray-400",
};

export const CENTER_STATUS_ORDER: CenterStatus[] = ["space_available", "limited", "full", "unknown"];

/** Full-capacity threshold before "limited"/"full" band boundaries, per PRD Gap B. Kept low ("limited" well before literally full) since a shelter approaching capacity needs advance notice, not a last-minute one. */
const LIMITED_AT_RATIO = 0.7;
const FULL_AT_RATIO = 0.95;

/** Derives a plain-language status from a real headcount instead of requiring a separate manual choice — PRD Gap B (evacuation center capacity management). */
export function deriveCenterStatusFromOccupancy(capacity: number, occupancy: number): CenterStatus {
  if (capacity <= 0) return "full";
  const ratio = occupancy / capacity;
  if (ratio >= FULL_AT_RATIO) return "full";
  if (ratio >= LIMITED_AT_RATIO) return "limited";
  return "space_available";
}

/**
 * The capacity status the rest of the app should display. If a live
 * headcount is being tracked (capacity + occupancy both known), that
 * derives the status directly — otherwise the zone's own centerStatus
 * (evacuation_centers.status, already carried through /api/zones) is the
 * answer.
 *
 * This used to take a fourth `override` parameter: a manual centerStatus
 * override read from a local store, kept separate from `zoneDefault` because
 * the two could disagree. They can't any more — the local override store is
 * gone (an operator's status edit now writes evacuation_centers.status
 * directly, via setCenterStatus) and `zoneDefault` already IS that column, so
 * a parameter that could only ever equal another parameter was a trap for the
 * next reader. Collapsed here rather than left in as dead plumbing.
 *
 * capacity and occupancy are required rather than optional even though both
 * accept undefined. Omitting them silently skipped a tracked headcount, so a
 * caller that simply forgot got a plausible-looking wrong answer instead of an
 * error — which is how one page came to show "Space available" for a centre
 * every other surface was reporting as full. Passing undefined explicitly is
 * a decision; leaving the arguments off was an accident waiting to repeat.
 */
export function resolveEffectiveCenterStatus(
  zoneDefault: CenterStatus,
  capacity: number | undefined,
  occupancy: number | undefined
): CenterStatus {
  if (capacity !== undefined && occupancy !== undefined) {
    return deriveCenterStatusFromOccupancy(capacity, occupancy);
  }
  return zoneDefault;
}
