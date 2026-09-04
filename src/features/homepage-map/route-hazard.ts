import type { ZoneStatus } from "@/lib/zone-status";
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

/**
 * True if any waypoint on routeZone's evacuation path passes near another
 * zone currently at Dangerous/Hazardous status.
 *
 * `zoneStatusOf` is required rather than resolved in here on purpose. This
 * function previously read the mock alert directly, which made it the one
 * place in the app that could not see an operator's severity override — so a
 * zone the operator had just escalated to Hazardous went on being routed
 * through, unflagged. Taking the resolver as a parameter means the caller
 * supplies the same override-aware status every other surface uses, and
 * cannot accidentally fall back to raw mock data.
 */
export function routeCrossesHazard(
  routeZone: Zone,
  zones: Zone[],
  zoneStatusOf: (zoneId: string) => ZoneStatus
): boolean {
  return zones.some(
    (z) =>
      z.id !== routeZone.id &&
      HAZARD_ZONE_STATUSES.has(zoneStatusOf(z.id)) &&
      routeZone.evacuationRoutePath.some(
        ([lat, lng]) =>
          Math.abs(lat - z.lat) < HAZARD_PROXIMITY_DEGREES &&
          Math.abs(lng - z.lng) < HAZARD_PROXIMITY_DEGREES
      )
  );
}
