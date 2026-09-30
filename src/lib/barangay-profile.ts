import { HAZARD_LEVEL_LABEL, type HazardLevel } from "./hazards";
import type { LocalizedText, Zone } from "./types";

/** How far the downstream barangay may be; set_barangay_profile refuses farther. */
export const DOWNSTREAM_RADIUS_M = 20_000;

/** The profile form asks, so "unknown" reads as the official's own answer. */
export const PROFILE_LEVEL_LABEL: Record<HazardLevel, LocalizedText> = {
  ...HAZARD_LEVEL_LABEL,
  unknown: { en: "Not sure", fil: "Hindi tiyak" },
};

export interface DownstreamChoice {
  id: string;
  name: string;
  municipalityName: string;
  distanceM: number;
}

/**
 * The barangays the official may name as where their floodwater goes next:
 * every other one within 20 km, nearest first. The distance is the database
 * check's own (set_barangay_profile), so the list never offers one it refuses.
 */
export function downstreamChoices(zone: Zone, zones: Zone[]): DownstreamChoice[] {
  const cos = Math.cos((zone.lat * Math.PI) / 180);
  return zones
    .filter((other) => other.id !== zone.id)
    .map((other) => ({
      id: other.id,
      name: other.name,
      municipalityName: other.municipalityName,
      distanceM: 111320 * Math.hypot(other.lat - zone.lat, (other.lng - zone.lng) * cos),
    }))
    .filter((choice) => choice.distanceM <= DOWNSTREAM_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM);
}
