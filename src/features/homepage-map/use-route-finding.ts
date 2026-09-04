"use client";

import { useState } from "react";
import { getZoneStatus, type ZoneStatus } from "@/lib/zone-status";
import { useZoneOverrides, resolveEffectiveAlert } from "@/lib/zone-overrides";
import { routeCrossesHazard } from "./route-hazard";
import type { LocalizedText, Zone } from "@/lib/types";

const NO_SAFE_AREA_FOUND: LocalizedText = {
  en: "No zone is currently Safe.",
  fil: "Walang zone na Ligtas sa ngayon.",
};
/**
 * Covers both ways the search can come up empty — every path crosses a hazard,
 * or every centre sits in one. Saying only "every route passes through a
 * hazardous area" would be untrue in the second case, and a resident deciding
 * where to go deserves the real reason.
 */
const NO_SAFE_ROUTE_FOUND: LocalizedText = {
  en: "No evacuation center is currently safe to reach.",
  fil: "Walang evacuation center na ligtas puntahan sa ngayon.",
};

/** A destination a resident should not be sent to, whatever the path there looks like. */
const HAZARDOUS_DESTINATION_STATUSES = new Set<ZoneStatus>(["dangerous", "hazardous"]);

/**
 * Manages route-finding state: which zone the user is navigating to,
 * whether the route crosses a hazard, and the "find safe" actions.
 */
export function useRouteFinding(zones: Zone[]) {
  const [routeZoneId, setRouteZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [notice, setNotice] = useState<LocalizedText | null>(null);
  const overrides = useZoneOverrides();

  /**
   * One override-aware definition of a zone's status, shared by every check
   * below. Previously "find safe area" resolved overrides while the hazard
   * check read raw mock data, so this hook could answer "is that zone
   * hazardous?" two different ways in the same render.
   */
  const zoneStatusOf = (zoneId: string) =>
    getZoneStatus(resolveEffectiveAlert(zoneId, overrides[zoneId]?.alertSeverity));

  const routeZone = zones.find((z) => z.id === routeZoneId) ?? null;
  const routeHazard = routeZone ? routeCrossesHazard(routeZone, zones, zoneStatusOf) : false;

  function handleSelectZone(zoneId: string) {
    setRouteZoneId(zoneId);
    setNotice(null);
  }

  function handleFindSafeArea() {
    const safeZone = zones.find((z) => zoneStatusOf(z.id) === "safe");
    if (safeZone) {
      setRouteZoneId(safeZone.id);
      setNotice(null);
    } else {
      setNotice(NO_SAFE_AREA_FOUND);
    }
  }

  function handleFindSafeEvacuationCenter() {
    // Both halves matter: a clear path is no use if it ends somewhere the
    // operator is evacuating. routeCrossesHazard deliberately ignores the
    // route zone's own status (it is checking what the path passes, not where
    // it lands), so without this the action could name a centre inside a
    // Dangerous or Hazardous zone and still call it safe.
    const safeRouteZone = zones.find(
      (z) => !HAZARDOUS_DESTINATION_STATUSES.has(zoneStatusOf(z.id)) && !routeCrossesHazard(z, zones, zoneStatusOf)
    );
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
