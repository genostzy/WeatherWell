import type { Zone } from "./types";

/** Puts the resident's own selected zone first so the homepage map centers on it, not an arbitrary zone. */
export function orderZonesWithSelectedFirst(zones: Zone[], selectedZoneId: string): Zone[] {
  const selected = zones.find((z) => z.id === selectedZoneId);
  if (!selected) return zones;
  return [selected, ...zones.filter((z) => z.id !== selectedZoneId)];
}
