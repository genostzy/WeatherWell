"use client";

import { useContext } from "react";
import { ReferenceDataContext } from "./provider";
import type { HazardRiskLevel, HazardType, PointOfInterest, Zone } from "@/lib/types";

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

/** Replaces the old per-zone mock-data hazard lookup. Returns an empty record for an unknown zone. */
export function useHazardsForZone(zoneId: string): Record<HazardType, HazardRiskLevel> {
  return useData().hazards[zoneId] ?? ({} as Record<HazardType, HazardRiskLevel>);
}

/** Every zone's hazard ratings, keyed by zone id. For callers that need many zones at once — pure functions taking this as a parameter, rather than calling a hook per zone. */
export function useHazards(): Record<string, Record<HazardType, HazardRiskLevel>> {
  return useData().hazards;
}
