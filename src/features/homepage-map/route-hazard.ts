import { getZoneStatus, type ZoneStatus } from "@/lib/zone-status";
import { getActiveAlertForZone } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

const HAZARD_ZONE_STATUSES = new Set<ZoneStatus>(["dangerous", "hazardous"]);

/**
 * Proximity threshold, in degrees, for treating a route waypoint as passing
 * near another zone — roughly 1km. The shipped mock zones are real,
 * properly-spaced barangays several km apart (see mock-data.ts), so none of
 * their short local evacuation routes actually trip this in practice — that
 * is the geographically correct outcome, not a bug. See route-hazard.test.ts
 * for coverage of the crossing logic itself, using synthetic zones placed
 * close enough together to exercise it.
 */
const HAZARD_PROXIMITY_DEGREES = 0.009;

/** True if any waypoint on routeZone's evacuation path passes near another zone currently at Dangerous/Hazardous status. */
export function routeCrossesHazard(routeZone: Zone, zones: Zone[]): boolean {
  return zones.some(
    (z) =>
      z.id !== routeZone.id &&
      HAZARD_ZONE_STATUSES.has(getZoneStatus(getActiveAlertForZone(z.id))) &&
      routeZone.evacuationRoutePath.some(
        ([lat, lng]) =>
          Math.abs(lat - z.lat) < HAZARD_PROXIMITY_DEGREES &&
          Math.abs(lng - z.lng) < HAZARD_PROXIMITY_DEGREES
      )
  );
}
