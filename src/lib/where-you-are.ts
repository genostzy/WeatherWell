import { getBearingAndDistance } from "@/features/homepage-map/bearing-distance";
import { findNearestZone } from "@/lib/nearest-zone";
import type { Zone } from "@/lib/types";

/**
 * Within this distance of my barangay's centre the resident counts as home.
 * In dense places barangay centres sit ~150 m apart and a phone's position
 * (low accuracy, to save battery) can be off by hundreds of metres, so the
 * nearest centre would hand a report made at home to a neighbour.
 */
// ponytail: one national radius; per-area radii if rural barangays need a smaller one.
export const HOME_RADIUS_METERS = 2000;

/**
 * The barangay GPS puts the resident in, when they are away from home: the
 * nearest barangay centre within 15 km, as setup's "Use my location" matches,
 * and nothing within HOME_RADIUS_METERS of my barangay's centre. Worked out
 * on the phone from zones it already holds; the position goes nowhere for it.
 */
export function findWhereYouAre(
  position: { lat: number; lng: number } | null,
  zones: readonly Zone[],
  myZone?: { lat: number; lng: number } | null
): Zone | null {
  if (!position) return null;
  if (myZone && getBearingAndDistance(position, myZone).distanceMeters <= HOME_RADIUS_METERS) return null;
  const nearest = findNearestZone(position, zones);
  return nearest?.isNear ? nearest.zone : null;
}
