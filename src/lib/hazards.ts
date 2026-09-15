import type { HazardRiskLevel, HazardType, LocalizedText } from "./types";

/**
 * A zone's baseline susceptibility for one hazard, or "unknown" when the
 * database holds no hazard_susceptibility row for it (I3).
 *
 * Unknown is its own value, never folded into "low": a barangay nobody has
 * rated is not a barangay rated safe. It is excluded from the risk score
 * (see computeZoneState), never raises a caution, and is shown as
 * "Unknown" / "Hindi tiyak".
 */
export type HazardLevel = HazardRiskLevel | "unknown";

/** One zone's susceptibility for every hazard type, gaps already filled. */
export type ZoneHazards = Record<HazardType, HazardLevel>;

/**
 * Hazard rows as they arrive, keyed by zone id. Deliberately typed as
 * possibly missing at both levels: with V1's country-wide barangay list a
 * zone with no rows, or with only some hazard types, is the normal case. The
 * type makes reading `hazards[zoneId].flood` directly a compile error, so
 * every reader goes through `hazardsForZone`.
 */
export type HazardsByZone = Partial<Record<string, Partial<Record<HazardType, HazardRiskLevel>>>>;

/** The one place a missing hazard level becomes "unknown". */
export function hazardsForZone(hazards: HazardsByZone, zoneId: string): ZoneHazards {
  const known = hazards[zoneId];
  return {
    flood: known?.flood ?? "unknown",
    landslide: known?.landslide ?? "unknown",
    storm_surge: known?.storm_surge ?? "unknown",
  };
}

export const HAZARD_LEVEL_LABEL: Record<HazardLevel, LocalizedText> = {
  low: { en: "Low", fil: "Mababa" },
  medium: { en: "Medium", fil: "Katamtaman" },
  high: { en: "High", fil: "Mataas" },
  unknown: { en: "Unknown", fil: "Hindi tiyak" },
};
