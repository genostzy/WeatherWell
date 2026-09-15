import { SEVERITY_HEX } from "@/lib/severity";
import type { HazardLevel } from "@/lib/hazards";

/** Neutral grey for a zone with no hazard data: no severity colour to borrow. */
const UNKNOWN_HAZARD_HEX = "#9ca3af";

/**
 * Reuses the locked severity hexes for the hazard-tile backdrop instead of
 * inventing a second palette — the backdrop is rendered at low opacity as a
 * soft fill, which is what visually separates it from the opaque zone-status
 * markers that use the same colors at full strength (PRD: "one is a tile
 * fill and the other is a point marker").
 */
export function hazardRiskColor(level: HazardLevel): string {
  switch (level) {
    case "unknown":
      return UNKNOWN_HAZARD_HEX;
    case "low":
      return SEVERITY_HEX.yellow;
    case "medium":
      return SEVERITY_HEX.orange;
    case "high":
      return SEVERITY_HEX.red;
  }
}
