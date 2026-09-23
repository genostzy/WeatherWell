/**
 * Idea 10: in the Philippines, schools, barangay halls and covered courts are
 * the usual evacuation sites, and OpenStreetMap lists them (free Overpass
 * API, no key). Shown as "likely sites, not confirmed" where a barangay has
 * no verified centre, and offered to officials to confirm as the real one.
 */
export type CandidateKind = "school" | "hall" | "community_centre" | "court";

export interface CandidateSite {
  name: string;
  kind: CandidateKind;
  lat: number;
  lng: number;
  distanceM: number;
}

const RADIUS_M = 2000;
const MAX_CANDIDATES = 5;

export function buildOverpassQuery(lat: number, lng: number): string {
  const around = `around:${RADIUS_M},${lat},${lng}`;
  return (
    `[out:json][timeout:25];(` +
    `nwr(${around})[amenity~"^(school|townhall|community_centre)$"][name];` +
    `nwr(${around})[leisure=sports_centre][name];` +
    `);out center 40;`
  );
}

function kindOf(tags: Record<string, string>): CandidateKind | null {
  if (tags.amenity === "school") return "school";
  if (tags.amenity === "townhall") return "hall";
  if (tags.amenity === "community_centre") return "community_centre";
  if (tags.leisure === "sports_centre") return "court";
  return null;
}

function metres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return 111320 * Math.hypot(lat2 - lat1, (lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180));
}

export function parseOverpass(reply: unknown, lat: number, lng: number): CandidateSite[] {
  const elements = (reply as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const sites: CandidateSite[] = [];
  for (const el of elements as Array<Record<string, unknown>>) {
    const tags = (el.tags ?? {}) as Record<string, string>;
    const name = (tags.name ?? "").trim();
    const kind = kindOf(tags);
    const point = (el.center ?? el) as { lat?: unknown; lon?: unknown };
    if (!name || !kind || typeof point.lat !== "number" || typeof point.lon !== "number") continue;
    sites.push({ name, kind, lat: point.lat, lng: point.lon, distanceM: Math.round(metres(lat, lng, point.lat, point.lon)) });
  }
  return sites.sort((a, b) => a.distanceM - b.distanceM).slice(0, MAX_CANDIDATES);
}
