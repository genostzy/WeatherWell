"use client";

import { useSyncExternalStore } from "react";
import { getSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { useZones } from "@/lib/reference-data/use-reference-data";
import type { Zone } from "@/lib/types";

function subscribe(): () => void {
  return () => {};
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * Reads the zone the user chose during onboarding, resolved against the zones
 * the database actually has.
 *
 * The default is now the first zone of the loaded set rather than a mock
 * constant. ReferenceDataProvider guarantees at least the fetch succeeded; a
 * database with zero zones is a real failure and throwing beats returning
 * undefined into every page's `zone.name`.
 */
export function useSelectedZone(): Zone {
  const zones = useZones();
  const zoneId = useSyncExternalStore(subscribe, getSelectedZoneId, getServerSnapshot);

  if (zones.length === 0) {
    throw new Error("No zones available. The database returned an empty zone list.");
  }
  return zones.find((zone) => zone.id === zoneId) ?? zones[0];
}
