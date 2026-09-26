import { findNearestZone } from "@/lib/nearest-zone";
import type { Zone } from "@/lib/types";

/**
 * The barangay GPS puts the resident in: the nearest barangay centre within
 * 15 km, as setup's "Use my location" matches. Worked out on the phone from
 * zones it already holds; the position goes nowhere for it. Near a border
 * this can be the neighbour, since it matches centres, not boundaries.
 */
export function findWhereYouAre(position: { lat: number; lng: number } | null, zones: readonly Zone[]): Zone | null {
  if (!position) return null;
  const nearest = findNearestZone(position, zones);
  return nearest?.isNear ? nearest.zone : null;
}
