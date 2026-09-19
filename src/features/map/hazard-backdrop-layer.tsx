"use client";

import { useMemo } from "react";
import { Circle } from "react-leaflet";
import { useHazards } from "@/lib/reference-data/use-reference-data";
import { hazardRiskColor } from "./hazard-color";
import type { HazardType, Zone } from "@/lib/types";

/**
 * The baseline hazard-susceptibility shading (PRD Core Feature #8) — long-term
 * risk for the selected hazard, not live conditions. Drawn as soft circles
 * rather than boundary polygons, per the PRD's "no drawn zone boundaries"
 * decision.
 *
 * Pre-computes all hazard data in a single pass instead of per-zone hook calls.
 */
export function HazardBackdropLayer({
  zones,
  hazardType,
}: {
  zones: Zone[];
  hazardType: HazardType;
}) {
  const allHazards = useHazards();

  const circles = useMemo(() => {
    return zones.map((zone) => {
      const risk = allHazards[zone.id]?.[hazardType] ?? "unknown";
      const color = hazardRiskColor(risk);
      return { id: zone.id, lat: zone.lat, lng: zone.lng, color };
    });
  }, [zones, allHazards, hazardType]);

  return (
    <>
      {circles.map((c) => (
        <Circle
          key={`hazard-${c.id}`}
          center={[c.lat, c.lng]}
          radius={500}
          pathOptions={{
            color: c.color,
            fillColor: c.color,
            fillOpacity: 0.2,
            opacity: 0.3,
            weight: 1,
          }}
        />
      ))}
    </>
  );
}
