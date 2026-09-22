import type { Zone } from "@/lib/types";

/**
 * Whether a zone carries safety infrastructure that actually exists.
 *
 * The nationwide barangay seed (20260917130740_nationwide_barangays.sql)
 * filled every zone it could not source real data for with placeholders:
 * an all-zero hotline and a nameless evacuation centre pinned at the zone's
 * own centroid. Rendering those as real is the one place this project
 * fabricates safety information — a resident dials a dead number, or walks
 * to an arbitrary GPS point, during a flood.
 *
 * Every surface that renders a hotline or an evacuation centre consults
 * these first, so "we don't have this for your barangay" is said once,
 * consistently, instead of each screen inventing its own idea of real.
 */

/** The seed's placeholder is all zeroes; a real number never is. */
const ALL_ZEROES = /^0+$/;

export function hasRealHotline(zone: Pick<Zone, "hotlineNumber">): boolean {
  const number = zone.hotlineNumber.trim();
  if (number.length === 0) return false;
  return !ALL_ZEROES.test(number);
}

export function hasRealEvacuationCenter(zone: Zone): boolean {
  return zone.evacuationCenterName.trim().length > 0;
}
