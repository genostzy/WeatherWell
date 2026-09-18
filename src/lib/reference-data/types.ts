import type { HazardType, PointOfInterest, Zone } from "@/lib/types";
import type { HazardLevel, HazardsByZone } from "@/lib/hazards";

/**
 * Everything the app needs before it can render anything, in one response.
 * One request means one service-worker cache entry, which means these three
 * can never disagree about which zones exist.
 */
export interface ReferenceData {
  zones: Zone[];
  pois: PointOfInterest[];
  /** Possibly missing per zone and per hazard type. Read through hazardsForZone. */
  hazards: HazardsByZone;
}

/** Row shapes as Postgres returns them — snake_case, centre nested by the join. */
interface ZoneRow {
  id: string;
  psgc_barangay_code: string;
  name: string;
  municipality_name: string;
  province_name: string;
  evacuation_route_text: Zone["evacuationRouteText"];
  lat: number;
  lng: number;
  evacuation_route_path: Zone["evacuationRoutePath"];
  hotline_number: string;
  downstream_zone_id: string | null;
  evacuation_centers: {
    name: string;
    lat: number;
    lng: number;
    capacity: number;
    status: Zone["centerStatus"];
    current_occupancy: number | null;
  } | null;
}

interface PoiRow {
  id: string;
  zone_id: string;
  category: PointOfInterest["category"];
  name: string;
  lat: number;
  lng: number;
}

interface HazardRow {
  zone_id: string;
  hazard_type: HazardType;
  risk_level: HazardLevel;
}

/**
 * Normalised in Postgres, denormalised here. The app's `Zone` type predates
 * the database and 23 files depend on it, so the mapping happens once, on the
 * server, rather than rippling a type change through the whole client.
 */
export function toReferenceData(
  zoneRows: ZoneRow[],
  poiRows: PoiRow[],
  hazardRows: HazardRow[]
): ReferenceData {
  const zones: Zone[] = zoneRows.map((row) => {
    const centre = row.evacuation_centers;
    if (!centre) {
      // A zone with no centre has nowhere to send anyone. Failing loudly here
      // beats rendering "evacuate to undefined".
      throw new Error(
        `Zone ${row.id} has no evacuation centre. The database is inconsistent — ` +
          `every zone requires one row in evacuation_centers.`
      );
    }
    return {
      id: row.id,
      psgcBarangayCode: row.psgc_barangay_code,
      name: row.name,
      municipalityName: row.municipality_name,
      provinceName: row.province_name,
      evacuationCenterName: centre.name,
      evacuationRouteText: row.evacuation_route_text,
      lat: row.lat,
      lng: row.lng,
      evacuationCenterLat: centre.lat,
      evacuationCenterLng: centre.lng,
      evacuationRoutePath: row.evacuation_route_path,
      hotlineNumber: row.hotline_number,
      centerStatus: centre.status,
      evacuationCenterCapacity: centre.capacity,
      // The type says optional; null would sneak past `if (zone.downstreamZoneId)`
      // less obviously than undefined in code that spreads or serialises it.
      ...(row.downstream_zone_id ? { downstreamZoneId: row.downstream_zone_id } : {}),
      // Same reasoning as downstreamZoneId above: a centre with no live headcount
      // yet is `current_occupancy IS NULL`, and undefined (not null, not 0) is
      // what resolveEffectiveCenterStatus's `occupancy` parameter expects to mean
      // "nothing tracked, fall back to centerStatus".
      ...(centre.current_occupancy !== null ? { currentOccupancy: centre.current_occupancy } : {}),
    };
  });

  const pois: PointOfInterest[] = poiRows.map((row) => ({
    id: row.id,
    zoneId: row.zone_id,
    category: row.category,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
  }));

  const hazards: Record<string, Partial<Record<HazardType, HazardLevel>>> = {};
  for (const row of hazardRows) {
    hazards[row.zone_id] ??= {};
    hazards[row.zone_id][row.hazard_type] = row.risk_level;
  }

  return { zones, pois, hazards };
}
