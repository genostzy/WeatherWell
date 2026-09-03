"use client";

import { useState } from "react";
import { getZoneStatus } from "@/lib/zone-status";
import { useZoneOverrides, resolveEffectiveAlert } from "@/lib/zone-overrides";
import { routeCrossesHazard } from "./route-hazard";
import type { LocalizedText, Zone } from "@/lib/types";

const NO_SAFE_AREA_FOUND: LocalizedText = {
  en: "No zone is currently Safe.",
  fil: "Walang zone na Ligtas sa ngayon.",
};
const NO_SAFE_ROUTE_FOUND: LocalizedText = {
  en: "Every route currently passes through a hazardous area.",
  fil: "Lahat ng ruta ay dumadaan sa mapanganib na lugar sa ngayon.",
};

/**
 * Manages route-finding state: which zone the user is navigating to,
 * whether the route crosses a hazard, and the "find safe" actions.
 */
export function useRouteFinding(zones: Zone[]) {
  const [routeZoneId, setRouteZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [notice, setNotice] = useState<LocalizedText | null>(null);
  const overrides = useZoneOverrides();

  const routeZone = zones.find((z) => z.id === routeZoneId) ?? null;
  const routeHazard = routeZone ? routeCrossesHazard(routeZone, zones) : false;

  function handleSelectZone(zoneId: string) {
    setRouteZoneId(zoneId);
    setNotice(null);
  }

  function handleFindSafeArea() {
    const safeZone = zones.find(
      (z) => getZoneStatus(resolveEffectiveAlert(z.id, overrides[z.id]?.alertSeverity)) === "safe"
    );
    if (safeZone) {
      setRouteZoneId(safeZone.id);
      setNotice(null);
    } else {
      setNotice(NO_SAFE_AREA_FOUND);
    }
  }

  function handleFindSafeEvacuationCenter() {
    const safeRouteZone = zones.find((z) => !routeCrossesHazard(z, zones));
    if (safeRouteZone) {
      setRouteZoneId(safeRouteZone.id);
      setNotice(null);
    } else {
      setNotice(NO_SAFE_ROUTE_FOUND);
    }
  }

  return {
    routeZone,
    routeHazard,
    notice,
    handleSelectZone,
    handleFindSafeArea,
    handleFindSafeEvacuationCenter,
  } as const;
}
