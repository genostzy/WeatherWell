import { getZoneStatus, type ZoneStatus } from "@/lib/zone-status";
import { getActiveAlertForZone } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

const HAZARD_ZONE_STATUSES = new Set<ZoneStatus>(["dangerous", "hazardous"]);

/**
 * Proximity threshold, in degrees, for treating a route waypoint as passing
 * near another zone. Tuned against this mock dataset's actual zone spacing
 * (0.008–0.0105 degrees apart) so the hazard-route warning is reachable for
 * some zones but not others — zone-1's route sits close enough to zone-2 to
 * trip it, while zone-2's and zone-3's own short local routes stay too close
 * to home to trip on each other. A threshold of 0.012 (tried first) made
 * every zone pair trip, leaving no reachable "safe route" demo state; 0.003
 * (the original value) made no pair trip at all. 0.009 sits between the two.
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
