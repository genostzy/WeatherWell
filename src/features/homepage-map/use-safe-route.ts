"use client";

import { useRef, useState } from "react";
import { useAlerts } from "@/lib/alerts-store";
import { useCommunityPins } from "@/lib/community-pins";
import type { CandidateSite } from "@/lib/osm-candidates";
import type { RouteResponse } from "@/lib/route-types";
import {
  findSafeArea,
  findSafeDestination,
  routeToDestination,
  usableAreas,
  usableCentres,
  type Destination,
  type LatLng,
  type SafeRouteResult,
} from "@/lib/safe-route";
import type { Zone } from "@/lib/types";
import { hasRealEvacuationCenter } from "@/lib/zone-data-quality";
import { getZoneStatus, type ZoneStatus } from "@/lib/zone-status";

/** Longer than the server's 8 seconds for the router, so a slow router answers with its straight line rather than with nothing. */
const ROUTE_WAIT_MS = 12_000;
const SITES_WAIT_MS = 15_000;

/**
 * A signal that aborts after `ms`. Not AbortSignal.timeout: iOS 15 and older
 * phones lack it, and there every walk would quietly become a straight line.
 */
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

type Search = { kind: "centre" } | { kind: "area" } | { kind: "zone"; zoneId: string };

export interface SafeRoute {
  /** Null until a search is made, and while the next one runs. */
  result: SafeRouteResult | null;
  searching: boolean;
  /** The search started from the barangay's point because the phone has no position. */
  fromBarangay: boolean;
  /** The phone had no connection: `result` is a straight line to the nearest place from saved data. */
  offline: boolean;
  findCentre(): void;
  findArea(): void;
  /** A tap on a barangay's marker: the way to its centre (or its point), with no search for a better place. */
  routeToZone(zoneId: string): void;
  /** Asks again, from where the resident is now. */
  recalculate(): void;
}

async function fetchRoutes(from: LatLng, to: LatLng): Promise<RouteResponse> {
  // In the body, never the address: `from` is where the resident stands.
  const res = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: [from.lat, from.lng], to: [to.lat, to.lng] }),
    signal: timeoutSignal(ROUTE_WAIT_MS),
  });
  if (!res.ok) throw new Error(`/api/route responded ${res.status}`);
  return (await res.json()) as RouteResponse;
}

async function fetchLikelySites(zoneId: string): Promise<CandidateSite[]> {
  // The barangay, never the resident's position: a position stays out of every address.
  const res = await fetch(`/api/evacuation-candidates?zoneId=${encodeURIComponent(zoneId)}`, {
    signal: timeoutSignal(SITES_WAIT_MS),
  });
  if (!res.ok) throw new Error(`/api/evacuation-candidates responded ${res.status}`);
  return (await res.json()) as CandidateSite[];
}

/** A barangay's centre when it has a real one, else the barangay's own point. */
function destinationOf(zone: Zone): Destination {
  return hasRealEvacuationCenter(zone)
    ? { kind: "centre", zone, name: zone.evacuationCenterName, lat: zone.evacuationCenterLat, lng: zone.evacuationCenterLng }
    : { kind: "area", zone, name: zone.name, lat: zone.lat, lng: zone.lng };
}

/** With no connection nothing is routed: the place, and a straight line to it. */
function offlineAnswer(destination: Destination | undefined, from: LatLng): SafeRouteResult {
  if (!destination) return { status: "none", problems: [], fallback: false };
  return {
    status: "found",
    destination,
    route: { polyline: [[from.lat, from.lng], [destination.lat, destination.lng]], distanceMeters: null, durationSeconds: null },
    problems: [],
    fallback: true,
  };
}

/**
 * The home screen's "Find safe evacuation center", "Find safe area" and marker
 * taps: where to go, the walk there, and what was checked on it (see
 * findSafeDestination). Nothing is fetched until one of them is called.
 *
 * The start is the live position, else `startZone`'s point ("from your
 * barangay"). A search that is still running when the next begins is dropped:
 * only the latest one's answer is kept.
 */
export function useSafeRoute({
  zones,
  livePosition,
  startZone,
}: {
  zones: Zone[];
  livePosition: LatLng | null;
  /** Where the resident is, or failing that their own barangay. */
  startZone: Zone;
}): SafeRoute {
  const alerts = useAlerts();
  const pins = useCommunityPins();
  const [result, setResult] = useState<SafeRouteResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [fromBarangay, setFromBarangay] = useState(false);
  const [offline, setOffline] = useState(false);
  const latest = useRef(0);
  const lastSearch = useRef<Search | null>(null);

  function run(search: Search) {
    lastSearch.current = search;
    const id = ++latest.current;
    const from: LatLng = livePosition ?? { lat: startZone.lat, lng: startZone.lng };
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    setFromBarangay(livePosition === null);
    setOffline(isOffline);

    const statusById = new Map<string, ZoneStatus>();
    for (const alert of alerts) if (alert.isActive) statusById.set(alert.zoneId, getZoneStatus(alert));
    const statusOf = (zoneId: string): ZoneStatus => statusById.get(zoneId) ?? "safe";
    const context = { from, startZoneId: startZone.id, zones, statusOf, pins, now: Date.now() };

    const zone = search.kind === "zone" ? zones.find((z) => z.id === search.zoneId) : undefined;
    if (search.kind === "zone" && !zone) return;

    if (isOffline) {
      const nearest =
        search.kind === "centre" ? usableCentres(context)[0] : search.kind === "area" ? usableAreas(context)[0] : destinationOf(zone!);
      setResult(offlineAnswer(nearest, from));
      setSearching(false);
      return;
    }

    setResult(null);
    setSearching(true);
    const answer =
      search.kind === "centre"
        ? findSafeDestination({ ...context, fetchRoutes, fetchLikelySites: () => fetchLikelySites(startZone.id) })
        : search.kind === "area"
          ? findSafeArea({ ...context, fetchRoutes })
          : routeToDestination(destinationOf(zone!), { ...context, fetchRoutes });
    answer
      // Never a spinner forever: whatever went wrong, the resident is told nothing was found and can still call.
      .catch((): SafeRouteResult => ({ status: "none", problems: [], fallback: false }))
      .then((found) => {
        if (id !== latest.current) return;
        setResult(found);
        setSearching(false);
      });
  }

  return {
    result,
    searching,
    fromBarangay,
    offline,
    findCentre: () => run({ kind: "centre" }),
    findArea: () => run({ kind: "area" }),
    routeToZone: (zoneId) => run({ kind: "zone", zoneId }),
    recalculate: () => {
      if (lastSearch.current) run(lastSearch.current);
    },
  };
}
