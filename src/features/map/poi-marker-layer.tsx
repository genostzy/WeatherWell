"use client";

import { Marker, Popup } from "react-leaflet";
import { usePois } from "@/lib/reference-data/use-reference-data";
import { createPoiMarkerIcon } from "./marker-icons";
import type { Zone } from "@/lib/types";

/**
 * Essential-service points — health center, pharmacy, market, water station,
 * barangay office. Read-only on both maps: there's nothing an admin does to a
 * POI that a resident doesn't, so unlike the zone and pin layers this one is
 * shared wholesale rather than duplicated per map.
 */
export function PoiMarkerLayer({ zones }: { zones: Zone[] }) {
  const pois = usePois();
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const visiblePois = pois.filter((poi) => zoneIds.has(poi.zoneId));

  return (
    <>
      {visiblePois.map((poi) => (
        <Marker key={poi.id} position={[poi.lat, poi.lng]} icon={createPoiMarkerIcon(poi.category, poi.name)}>
          <Popup>{poi.name}</Popup>
        </Marker>
      ))}
    </>
  );
}
