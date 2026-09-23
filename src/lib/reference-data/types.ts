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

/**
 * The previous file format: identical to ReferenceData except each zone's
 * evacuationRouteText is an index into evacuationRouteTextTable. Still read,
 * because the service worker may hold a cached copy.
 */
interface LegacyRawReferenceData {
  zones: (Omit<Zone, "evacuationRouteText"> & { evacuationRouteText: number })[];
  evacuationRouteTextTable: Zone["evacuationRouteText"][];
  pois: PointOfInterest[];
  hazards: HazardsByZone;
}

/**
 * One zone as /data/reference-data.json stores it (H1). Nearly all ~42k zones
 * are seed placeholders, so every field that holds its placeholder default is
 * left out, and municipality/province pairs and route texts are interned into
 * tables. That took the file from 22 MB to 4.3 MB without changing the Zone
 * type the rest of the app reads. An omitted field means:
 *   psgcBarangayCode  the digits after "zone-" in id
 *   evacuationRouteText  table entry 0
 *   evacuationRoutePath  [[lat, lng]]
 *   hotlineNumber  "00000000000"
 *   evacuationCenterName  "Evacuation Centre — <municipality>"
 *   evacuationCenterLat/Lng  the zone's own point
 *   centerStatus  "unknown";  evacuationCenterCapacity  0
 */
interface CompactZone {
  id: string;
  name: string;
  place: number;
  lat: number;
  lng: number;
  code?: string;
  route?: number;
  path?: Zone["evacuationRoutePath"];
  hotline?: string;
  down?: string;
  centre?: string;
  centreLat?: number;
  centreLng?: number;
  status?: Zone["centerStatus"];
  capacity?: number;
  occupancy?: number;
}

export interface CompactReferenceData {
  format: 2;
  zones: CompactZone[];
  places: [municipality: string, province: string][];
  routes: Zone["evacuationRouteText"][];
  pois: PointOfInterest[];
  hazards: HazardsByZone;
}

const PLACEHOLDER_HOTLINE = "00000000000";
const placeholderCentre = (municipality: string) => `Evacuation Centre — ${municipality}`;

export function compactReferenceData(data: ReferenceData): CompactReferenceData {
  const places: [string, string][] = [];
  const placeIndex = new Map<string, number>();
  const routes: Zone["evacuationRouteText"][] = [];
  const routeIndex = new Map<string, number>();
  const intern = <T>(table: T[], index: Map<string, number>, key: string, value: T) => {
    let i = index.get(key);
    if (i === undefined) {
      i = table.push(value) - 1;
      index.set(key, i);
    }
    return i;
  };

  const zones = data.zones.map((z) => {
    const c: CompactZone = {
      id: z.id,
      name: z.name,
      place: intern(places, placeIndex, `${z.municipalityName}|${z.provinceName}`, [z.municipalityName, z.provinceName]),
      lat: z.lat,
      lng: z.lng,
    };
    const route = intern(routes, routeIndex, `${z.evacuationRouteText.en}|${z.evacuationRouteText.fil}`, z.evacuationRouteText);
    if (z.id !== `zone-${z.psgcBarangayCode}`) c.code = z.psgcBarangayCode;
    if (route !== 0) c.route = route;
    const path = z.evacuationRoutePath;
    if (!(path.length === 1 && path[0][0] === z.lat && path[0][1] === z.lng)) c.path = path;
    if (z.hotlineNumber !== PLACEHOLDER_HOTLINE) c.hotline = z.hotlineNumber;
    if (z.downstreamZoneId) c.down = z.downstreamZoneId;
    if (z.evacuationCenterName !== placeholderCentre(z.municipalityName)) c.centre = z.evacuationCenterName;
    if (z.evacuationCenterLat !== z.lat) c.centreLat = z.evacuationCenterLat;
    if (z.evacuationCenterLng !== z.lng) c.centreLng = z.evacuationCenterLng;
    if (z.centerStatus !== "unknown") c.status = z.centerStatus;
    if (z.evacuationCenterCapacity !== 0) c.capacity = z.evacuationCenterCapacity;
    if (z.currentOccupancy !== undefined) c.occupancy = z.currentOccupancy;
    return c;
  });

  // hazardsForZone already reads a missing level as "unknown".
  const hazards: HazardsByZone = {};
  for (const [zoneId, levels] of Object.entries(data.hazards)) {
    const known = Object.fromEntries(Object.entries(levels ?? {}).filter(([, level]) => level !== "unknown"));
    if (Object.keys(known).length > 0) hazards[zoneId] = known;
  }

  return { format: 2, zones, places, routes, pois: data.pois, hazards };
}

/** Reverses compactReferenceData; also reads the previous interned-route format. */
export function expandReferenceData(raw: CompactReferenceData | LegacyRawReferenceData): ReferenceData {
  if (!("format" in raw)) {
    return {
      zones: raw.zones.map((zone) => ({
        ...zone,
        evacuationRouteText: raw.evacuationRouteTextTable[zone.evacuationRouteText],
      })),
      pois: raw.pois,
      hazards: raw.hazards,
    };
  }
  return {
    zones: raw.zones.map((c) => {
      const [municipalityName, provinceName] = raw.places[c.place];
      return {
        id: c.id,
        psgcBarangayCode: c.code ?? c.id.slice("zone-".length),
        name: c.name,
        municipalityName,
        provinceName,
        lat: c.lat,
        lng: c.lng,
        evacuationRouteText: raw.routes[c.route ?? 0],
        evacuationRoutePath: c.path ?? [[c.lat, c.lng]],
        hotlineNumber: c.hotline ?? PLACEHOLDER_HOTLINE,
        ...(c.down ? { downstreamZoneId: c.down } : {}),
        evacuationCenterName: c.centre ?? placeholderCentre(municipalityName),
        evacuationCenterLat: c.centreLat ?? c.lat,
        evacuationCenterLng: c.centreLng ?? c.lng,
        centerStatus: c.status ?? "unknown",
        evacuationCenterCapacity: c.capacity ?? 0,
        ...(c.occupancy !== undefined ? { currentOccupancy: c.occupancy } : {}),
      };
    }),
    pois: raw.pois,
    hazards: raw.hazards,
  };
}

/** One non-placeholder evacuation_centers row, as /api/centres serves it. */
export interface CentreOverlayRow {
  zone_id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  status: Zone["centerStatus"];
  current_occupancy: number | null;
}

/**
 * The static file is regenerated by hand, so an official's change to a
 * centre (status, headcount, a newly confirmed site) never reached residents.
 * The few centres that differ from the seed placeholder are fetched live and
 * laid over it; every other zone is returned as the same object.
 */
export function applyCentreOverlay(zones: Zone[], rows: CentreOverlayRow[]): Zone[] {
  if (rows.length === 0) return zones;
  const byZone = new Map(rows.map((r) => [r.zone_id, r]));
  return zones.map((zone) => {
    const row = byZone.get(zone.id);
    if (!row) return zone;
    const patched: Zone = {
      ...zone,
      evacuationCenterName: row.name,
      evacuationCenterLat: row.lat,
      evacuationCenterLng: row.lng,
      evacuationCenterCapacity: row.capacity,
      centerStatus: row.status,
    };
    // Absent (not null) means "no headcount tracked" to resolveEffectiveCenterStatus.
    if (row.current_occupancy === null) delete patched.currentOccupancy;
    else patched.currentOccupancy = row.current_occupancy;
    return patched;
  });
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
    return {
      id: row.id,
      psgcBarangayCode: row.psgc_barangay_code,
      name: row.name,
      municipalityName: row.municipality_name,
      provinceName: row.province_name,
      evacuationCenterName: centre?.name ?? "",
      evacuationRouteText: row.evacuation_route_text,
      lat: row.lat,
      lng: row.lng,
      evacuationCenterLat: centre?.lat ?? row.lat,
      evacuationCenterLng: centre?.lng ?? row.lng,
      evacuationRoutePath: row.evacuation_route_path,
      hotlineNumber: row.hotline_number,
      centerStatus: (centre?.status as Zone["centerStatus"]) ?? "space_available",
      evacuationCenterCapacity: centre?.capacity ?? 0,
      // The type says optional; null would sneak past `if (zone.downstreamZoneId)`
      // less obviously than undefined in code that spreads or serialises it.
      ...(row.downstream_zone_id ? { downstreamZoneId: row.downstream_zone_id } : {}),
      // Same reasoning as downstreamZoneId above: a centre with no live headcount
      // yet is `current_occupancy IS NULL`, and undefined (not null, not 0) is
      // what resolveEffectiveCenterStatus's `occupancy` parameter expects to mean
      // "nothing tracked, fall back to centerStatus".
      ...(centre && centre.current_occupancy !== null ? { currentOccupancy: centre.current_occupancy } : {}),
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
