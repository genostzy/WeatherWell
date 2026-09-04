"use client";

import { Marker, Popup } from "react-leaflet";
import { getPOIsForZone } from "@/lib/mock-data";
import { createPoiMarkerIcon } from "./marker-icons";
import type { Zone } from "@/lib/types";

/**
 * Essential-service points — health center, pharmacy, market, water station,
 * barangay office. Read-only on both maps: there's nothing an admin does to a
 * POI that a resident doesn't, so unlike the zone and pin layers this one is
 * shared wholesale rather than duplicated per map.
 */
export function PoiMarkerLayer({ zones }: { zones: Zone[] }) {
  return (
    <>
      {zones.flatMap((zone) =>
        getPOIsForZone(zone.id).map((poi) => (
          <Marker key={poi.id} position={[poi.lat, poi.lng]} icon={createPoiMarkerIcon(poi.category, poi.name)}>
            <Popup>{poi.name}</Popup>
          </Marker>
        ))
      )}
    </>
  );
}
