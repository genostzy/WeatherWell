"use client";

import { useCallback, useContext } from "react";
import { ReferenceDataContext, SetCenterStatusContext } from "./provider";
import { hazardsForZone, type HazardsByZone, type ZoneHazards } from "@/lib/hazards";
import type { PointOfInterest, Zone } from "@/lib/types";
import type { SetCenterStatusInput } from "@/app/actions/set-center";
import type { ActionResult } from "@/app/actions/action-result";

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

/**
 * The one way a screen sets an evacuation centre's status (R1).
 *
 * Before this existed, every control called setCenterStatus itself and did
 * nothing on success, so the write landed in the database while the zones
 * this hook's caller reads (useZones) kept showing the old status — and
 * because a controlled select already showing a value fires no change when
 * that same value is picked again, an official could not undo marking a
 * centre Full by mistake without a reload. Once the database confirms the
 * write, this patches the zone's centerStatus in ReferenceDataProvider's own
 * state (see SetCenterStatusContext), so every screen reading useZones()
 * follows — no refetch, because /api/zones is cached stale-while-revalidate
 * by the service worker and would hand back the pre-write copy.
 *
 * The dynamic import is for the same reason every caller used one before:
 * set-center.ts is a "use server" module that transitively imports
 * "server-only", and must not be evaluated in a client test's module graph.
 */
export function useSetCenterStatus(): (input: SetCenterStatusInput) => Promise<ActionResult> {
  const apply = useContext(SetCenterStatusContext);
  const setStatus = useCallback(
    async (input: SetCenterStatusInput) => {
      const { setCenterStatus } = await import("@/app/actions/set-center");
      const result = await setCenterStatus(input);
      if (result.ok) apply?.(input.zoneId, input.status);
      return result;
    },
    [apply]
  );
  if (!apply) {
    // A silent no-op here is exactly the R1 defect coming back.
    throw new Error(
      "useSetCenterStatus requires ReferenceDataProvider's center-status context. In tests, use renderWithData()."
    );
  }
  return setStatus;
}
