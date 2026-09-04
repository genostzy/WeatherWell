"use client";

import { Circle } from "react-leaflet";
import { getHazardSusceptibilityForZone } from "@/lib/mock-data";
import { hazardRiskColor } from "./hazard-color";
import type { HazardType, Zone } from "@/lib/types";

/**
 * The baseline hazard-susceptibility shading (PRD Core Feature #8) — long-term
 * risk for the selected hazard, not live conditions. Drawn as soft circles
 * rather than boundary polygons, per the PRD's "no drawn zone boundaries"
 * decision: administrative outlines would imply precision the underlying data
 * doesn't have at a zone's edges.
 *
 * Identical on both maps, so it lives here rather than in either one.
 */
export function HazardBackdropLayer({
  zones,
  hazardType,
}: {
  zones: Zone[];
  hazardType: HazardType;
}) {
  return (
    <>
      {zones.map((zone) => {
        const risk = getHazardSusceptibilityForZone(zone.id)[hazardType];
        return (
          <Circle
            key={`hazard-${zone.id}`}
            center={[zone.lat, zone.lng]}
            radius={500}
            pathOptions={{
              color: hazardRiskColor(risk),
              fillColor: hazardRiskColor(risk),
              fillOpacity: 0.2,
              opacity: 0.3,
              weight: 1,
            }}
          />
        );
      })}
    </>
  );
}
