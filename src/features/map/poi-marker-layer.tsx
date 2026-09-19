"use client";

import { Marker, Tooltip, Popup } from "react-leaflet";
import { usePois } from "@/lib/reference-data/use-reference-data";
import { createPoiMarkerIcon } from "./marker-icons";
import type { Zone } from "@/lib/types";

/**
 * Essential-service points — health center, pharmacy, market, water station,
 * barangay office. Read-only on both maps: there's nothing an admin does to a
 * POI that a resident doesn't, so unlike the zone and pin layers this one is
 * shared wholesale rather than duplicated per map.
 *
 * At zoom >= 16, permanent labels are shown so users can identify POIs
 * without tapping each one.
 */
export function PoiMarkerLayer({ zones, zoom = 14 }: { zones: Zone[]; zoom?: number }) {
  const pois = usePois();
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const visiblePois = pois.filter((poi) => zoneIds.has(poi.zoneId));
  const showLabel = zoom >= 16;

  return (
    <>
      {visiblePois.map((poi) => (
        <Marker key={poi.id} position={[poi.lat, poi.lng]} icon={createPoiMarkerIcon(poi.category, poi.name, showLabel)}>
          <Popup>{poi.name}</Popup>
          {zoom >= 17 && (
            <Tooltip permanent direction="bottom" offset={[0, 6]} className="evac-label-tooltip">
              <span className="text-[10px] font-medium">{poi.name}</span>
            </Tooltip>
          )}
        </Marker>
      ))}
    </>
  );
}
