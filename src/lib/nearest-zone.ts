import { getBearingAndDistance } from "@/features/homepage-map/bearing-distance";

/**
 * How far a GPS fix may be from a barangay's centre and still be offered as
 * "your barangay". Barangays range from a few city blocks to several square
 * kilometres, so this is generous; the resident always confirms.
 */
export const NEAR_ZONE_METERS = 5000;

/** A fix this imprecise (common indoors) is labelled "approximate". */
export const APPROXIMATE_ACCURACY_METERS = 1000;

export interface NearestZone<Z> {
  zone: Z;
  distanceMeters: number;
  /** Within NEAR_ZONE_METERS — close enough to offer, never to assume. */
  isNear: boolean;
}

/**
 * The covered barangay closest to a position, measured to each barangay's
 * centre point. V1's ~42k zones still use centroids (the GeoJSON boundaries
 * exist in the seed but aren't loaded client-side), so this remains a linear
 * scan — ~4ms for 42k zones, acceptable for a once-per-GPS-fix call.
 *
 * When boundaries are loaded client-side (e.g. via a GeoJSON tile or a
 * simplified polygon per zone), switch to point-in-polygon for accuracy:
 * a resident standing inside their barangay's boundary should match that
 * barangay even if its centre is further away than a neighbour's.
 */
export function findNearestZone<Z extends { lat: number; lng: number }>(
  position: { lat: number; lng: number },
  zones: readonly Z[]
): NearestZone<Z> | null {
  let best: NearestZone<Z> | null = null;
  for (const zone of zones) {
    const { distanceMeters } = getBearingAndDistance(position, zone);
    if (!best || distanceMeters < best.distanceMeters) {
      best = { zone, distanceMeters, isNear: distanceMeters <= NEAR_ZONE_METERS };
    }
  }
  return best;
}
