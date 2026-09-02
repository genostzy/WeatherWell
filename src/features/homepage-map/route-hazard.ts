import { getZoneStatus, type ZoneStatus } from "@/lib/zone-status";
import { getActiveAlertForZone } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

const HAZARD_ZONE_STATUSES = new Set<ZoneStatus>(["dangerous", "hazardous"]);

/**
 * Proximity threshold, in degrees, for treating a route waypoint as passing
 * near another zone. This mock dataset's three zones sit 0.008–0.0105
 * degrees apart, so the threshold is set above that range (rather than the
 * much tighter 0.003 previously used, which no zone pair in this dataset
 * could ever satisfy) so the hazard-route warning is actually reachable.
 */
const HAZARD_PROXIMITY_DEGREES = 0.012;

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
