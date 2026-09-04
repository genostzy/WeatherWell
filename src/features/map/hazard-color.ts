import { SEVERITY_HEX } from "@/lib/severity";
import type { HazardRiskLevel } from "@/lib/types";

/**
 * Reuses the locked severity hexes for the hazard-tile backdrop instead of
 * inventing a second palette — the backdrop is rendered at low opacity as a
 * soft fill, which is what visually separates it from the opaque zone-status
 * markers that use the same colors at full strength (PRD: "one is a tile
 * fill and the other is a point marker").
 */
export function hazardRiskColor(level: HazardRiskLevel): string {
  switch (level) {
    case "low":
      return SEVERITY_HEX.yellow;
    case "medium":
      return SEVERITY_HEX.orange;
    case "high":
      return SEVERITY_HEX.red;
  }
}
