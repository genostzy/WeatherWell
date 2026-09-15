"use client";

import { useContext } from "react";
import { ReferenceDataContext } from "./provider";
import { hazardsForZone, type HazardsByZone, type ZoneHazards } from "@/lib/hazards";
import type { PointOfInterest, Zone } from "@/lib/types";

function useData() {
  const data = useContext(ReferenceDataContext);
  if (!data) {
    // Returning empty arrays here would make a wiring mistake look like a
    // barangay with no zones and no alerts. Fail at the developer instead.
    throw new Error(
      "Reference data hooks require a <ReferenceDataProvider> ancestor. In tests, use renderWithData()."
    );
  }
  return data;
}

/** Every zone, ordered by id. Synchronous — the provider gates on this existing. */
export function useZones(): Zone[] {
  return useData().zones;
}

export function usePois(): PointOfInterest[] {
  return useData().pois;
}

/**
 * One zone's hazard levels, every type present: a zone with no hazard rows,
 * or missing one type, reads "unknown" for what is missing (I3).
 */
export function useHazardsForZone(zoneId: string): ZoneHazards {
  return hazardsForZone(useData().hazards, zoneId);
}

/** Every zone's hazard ratings, keyed by zone id. For callers that need many zones at once — pure functions taking this as a parameter, rather than calling a hook per zone. */
export function useHazards(): HazardsByZone {
  return useData().hazards;
}
