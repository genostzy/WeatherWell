"use client";

import { useState, useEffect, useMemo } from "react";
import { getZoneStatus, type ZoneStatus } from "@/lib/zone-status";
import { useAlerts } from "@/lib/alerts-store";
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

export interface RealRoute {
  polyline: [number, number][];
  distanceMeters: number | null;
  durationSeconds: number | null;
  fallback: boolean;
}

/**
 * Fetches a real road-network route from the OSRM-backed API.
 * Falls back to a straight line if the API is unavailable.
 */
async function fetchRealRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<RealRoute> {
  try {
    const res = await fetch(
      `/api/route?from=${fromLat},${fromLng}&to=${toLat},${toLng}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) throw new Error("Route fetch failed");
    return await res.json();
  } catch {
    // Fallback: straight line
    return {
      polyline: [
        [fromLat, fromLng],
        [toLat, toLng],
      ],
      distanceMeters: null,
      durationSeconds: null,
      fallback: true,
    };
  }
}

/**
 * Manages route-finding state: which zone the user is navigating to,
 * whether the route crosses a hazard, and the "find safe" actions.
 *
 * When a route zone is selected, fetches a real OSRM route in the background.
 * Falls back to the zone's static evacuationRoutePath if OSRM is unavailable.
 */
export function useRouteFinding(zones: Zone[]) {
  const [routeZoneId, setRouteZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [notice, setNotice] = useState<LocalizedText | null>(null);
  const [realRoute, setRealRoute] = useState<RealRoute | null>(null);
  const alerts = useAlerts();

  /**
   * One shared definition of a zone's status, used by every check below.
   * Previously "find safe area" resolved overrides while the hazard check
   * read raw mock data, so this hook could answer "is that zone hazardous?"
   * two different ways in the same render.
   */
  const zoneStatusOf = (zoneId: string) =>
    getZoneStatus(alerts.find((a) => a.zoneId === zoneId && a.isActive));

  const routeZone = zones.find((z) => z.id === routeZoneId) ?? null;
  const routeHazard = routeZone ? routeCrossesHazard(routeZone, zones, zoneStatusOf) : false;

  // Fetch real route when zone changes — the effect only calls setState in
  // an async callback (the .then), never synchronously in the effect body.
  useEffect(() => {
    if (!routeZone) return;

    let cancelled = false;

    fetchRealRoute(
      routeZone.lat,
      routeZone.lng,
      routeZone.evacuationCenterLat,
      routeZone.evacuationCenterLng
    ).then((route) => {
      if (!cancelled) {
        setRealRoute(route);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [routeZone]);

  /**
   * The effective route polyline: real OSRM route if available,
   * otherwise the zone's static evacuationRoutePath.
   */
  const effectiveRoutePolyline: [number, number][] = useMemo(
    () => realRoute?.polyline ?? routeZone?.evacuationRoutePath ?? [],
    [realRoute, routeZone]
  );

  function handleSelectZone(zoneId: string) {
    setRouteZoneId(zoneId);
    setNotice(null);
    setRealRoute(null);
  }

  function handleFindSafeArea() {
    const safeZone = zones.find((z) => zoneStatusOf(z.id) === "safe");
    if (safeZone) {
      setRouteZoneId(safeZone.id);
      setNotice(null);
      setRealRoute(null);
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
      setRealRoute(null);
    } else {
      setNotice(NO_SAFE_ROUTE_FOUND);
    }
  }

  return {
    routeZone,
    routeHazard,
    notice,
    realRoute,
    effectiveRoutePolyline,
    handleSelectZone,
    handleFindSafeArea,
    handleFindSafeEvacuationCenter,
  } as const;
}
