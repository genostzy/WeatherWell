import { resolveEffectiveCenterStatus } from "./center-status";
import type { PinStatusTag } from "./community-pin";
import type { CommunityPin } from "./community-pins";
import type { CandidateSite } from "./osm-candidates";
import type { RouteOption, RouteResponse } from "./route-types";
import type { Zone } from "./types";
import { hasRealEvacuationCenter } from "./zone-data-quality";
import type { ZoneStatus } from "./zone-status";

/**
 * Where "Find safe evacuation center" and "Find safe area" point a resident,
 * and whether the way there is clear. Pure: the router and the OpenStreetMap
 * search are passed in, so every rule here is tested without a network.
 *
 * The app knows a barangay's centre point, not its boundary, so "passes near a
 * barangay under alert" is an approximation, and the screen says "near".
 */

/** The farthest place, in a straight line, a resident is pointed to. */
export const SAFE_RADIUS_M = 10_000;
/** A route this close to the point of a barangay under Warning or Evacuate is flagged. */
export const ZONE_CLEARANCE_M = 500;
/** A route this close to a blocking pin is flagged. */
export const PIN_CLEARANCE_M = 50;
/** A blocking pin older than this no longer counts: the tree is cleared, the road open again. */
export const PIN_MAX_AGE_MS = 24 * 3600 * 1000;
/** Places tried, nearest first, before settling for the nearest one's least-affected route. */
export const MAX_CANDIDATES = 3;

export type LatLng = { lat: number; lng: number };

export type Destination =
  | ({ kind: "centre"; zone: Zone; name: string } & LatLng)
  | ({ kind: "likely"; site: CandidateSite; name: string } & LatLng)
  | ({ kind: "area"; zone: Zone; name: string } & LatLng);

export type RouteProblem =
  | { kind: "pin"; pin: CommunityPin; metresFromStart: number }
  | { kind: "zone"; zone: Zone };

export interface SafeRouteResult {
  status: "found" | "none";
  destination?: Destination;
  route?: RouteOption;
  /** What the shown route passes. Empty when it is clean. */
  problems: RouteProblem[];
  /** The router did not answer, so `route` is a straight line. */
  fallback: boolean;
}

interface SearchInput {
  from: LatLng;
  /** The barangay the resident starts in. Every route starts inside it, so it never counts against a route. */
  startZoneId: string | null;
  zones: Zone[];
  statusOf: (zoneId: string) => ZoneStatus;
  pins: CommunityPin[];
  now: number;
  fetchRoutes: (from: LatLng, to: LatLng) => Promise<RouteResponse>;
}

/** The pins that stop a walk: not the water levels, which the resident can judge for themselves. */
const BLOCKING_TAGS: ReadonlySet<PinStatusTag> = new Set<PinStatusTag>([
  "road_blocked",
  "landslide",
  "power_line_down",
  "impassable",
]);

const M_PER_DEG = 111_320;

/** Straight-line metres between two points, on a flat local approximation (well under 1% off at these distances). */
function metresBetween(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * M_PER_DEG;
  const dLng = (b.lng - a.lng) * M_PER_DEG * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * Where a route comes closest to a point: how close, in metres, and how far
 * along the route that is. Each segment is measured, not just the corners: a
 * long straight stretch between two corners can pass right beside the point.
 * Done on a flat projection about the point, which is exact enough for a walk.
 */
function closestOnRoute(point: LatLng, polyline: [number, number][]): { distanceM: number; alongM: number } {
  if (polyline.length === 0) return { distanceM: Infinity, alongM: 0 };
  const cos = Math.cos((point.lat * Math.PI) / 180);
  const local = ([lat, lng]: [number, number]): [number, number] => [
    (lng - point.lng) * M_PER_DEG * cos,
    (lat - point.lat) * M_PER_DEG,
  ];

  let [px, py] = local(polyline[0]);
  let best = Math.hypot(px, py);
  let bestAlong = 0;
  let walked = 0;
  for (let i = 1; i < polyline.length; i++) {
    const [qx, qy] = local(polyline[i]);
    const dx = qx - px;
    const dy = qy - py;
    const length2 = dx * dx + dy * dy;
    // Where on this segment the point (the origin) is nearest: 0 at its start, 1 at its end.
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(px * dx + py * dy) / length2));
    const distance = Math.hypot(px + t * dx, py + t * dy);
    const length = Math.sqrt(length2);
    if (distance < best) {
      best = distance;
      bestAlong = walked + t * length;
    }
    walked += length;
    px = qx;
    py = qy;
  }
  return { distanceM: best, alongM: bestAlong };
}

/** The shortest distance, in metres, from a point to a route drawn as [lat, lng] points. */
export function distanceToRouteMeters(point: LatLng, polyline: [number, number][]): number {
  return closestOnRoute(point, polyline).distanceM;
}

/** The pins that count against a route: standing, made in the last 24 hours, and a kind that blocks a walk. */
export function blockingPins(pins: CommunityPin[], now: number): CommunityPin[] {
  return pins.filter((pin) => {
    if (pin.removed || !BLOCKING_TAGS.has(pin.statusTag)) return false;
    // A pin dated a little in the future (a phone's clock) still counts; an unreadable date does not.
    return now - Date.parse(pin.createdAt) <= PIN_MAX_AGE_MS;
  });
}

/**
 * What a route passes: each blocking pin within 50 m, and each barangay under
 * alert within 500 m of its point, except the one the resident starts in.
 * `pins` are the ones that count (see blockingPins). A pin problem says how far
 * along the walk it is, to the nearest 10 m.
 */
export function routeProblems(
  polyline: [number, number][],
  { dangerZones, pins, startZoneId }: { dangerZones: Zone[]; pins: CommunityPin[]; startZoneId: string | null }
): RouteProblem[] {
  const pinProblems: Extract<RouteProblem, { kind: "pin" }>[] = [];
  for (const pin of pins) {
    const nearest = closestOnRoute(pin, polyline);
    if (nearest.distanceM <= PIN_CLEARANCE_M) {
      pinProblems.push({ kind: "pin", pin, metresFromStart: Math.round(nearest.alongM / 10) * 10 });
    }
  }
  // In the order the walk meets them.
  pinProblems.sort((a, b) => a.metresFromStart - b.metresFromStart);

  const zoneProblems: RouteProblem[] = [];
  for (const zone of dangerZones) {
    if (zone.id === startZoneId) continue;
    if (closestOnRoute(zone, polyline).distanceM <= ZONE_CLEARANCE_M) zoneProblems.push({ kind: "zone", zone });
  }
  return [...pinProblems, ...zoneProblems];
}

const isUnderAlert = (status: ZoneStatus) => status === "dangerous" || status === "hazardous";

/** Nearest first, only what is within reach. */
function withinReach<T>(items: T[], from: LatLng, pointOf: (item: T) => LatLng): T[] {
  return items
    .map((item) => ({ item, metres: metresBetween(from, pointOf(item)) }))
    .filter((entry) => entry.metres <= SAFE_RADIUS_M)
    .sort((a, b) => a.metres - b.metres)
    .map((entry) => entry.item);
}

/**
 * The confirmed centres a resident could go to, nearest first: within 10 km,
 * in a barangay not under Warning or Evacuate, and not full.
 */
export function usableCentres({
  from,
  zones,
  statusOf,
}: {
  from: LatLng;
  zones: Zone[];
  statusOf: (zoneId: string) => ZoneStatus;
}): Destination[] {
  const usable = zones.filter(
    (zone) =>
      hasRealEvacuationCenter(zone) &&
      !isUnderAlert(statusOf(zone.id)) &&
      resolveEffectiveCenterStatus(zone.centerStatus, zone.evacuationCenterCapacity, zone.currentOccupancy) !== "full"
  );
  return withinReach(usable, from, (zone) => ({ lat: zone.evacuationCenterLat, lng: zone.evacuationCenterLng })).map(
    (zone): Destination => ({
      kind: "centre",
      zone,
      name: zone.evacuationCenterName,
      lat: zone.evacuationCenterLat,
      lng: zone.evacuationCenterLng,
    })
  );
}

/** A straight walk, for when the router did not answer. Its length and time are unknown. */
function straightLine(from: LatLng, to: LatLng): RouteOption {
  return { polyline: [[from.lat, from.lng], [to.lat, to.lng]], distanceMeters: null, durationSeconds: null };
}

/** Routes to a place. Never throws: no answer at all is the same as the router falling back. */
async function routesTo(input: SearchInput, to: LatLng): Promise<RouteResponse> {
  try {
    const response = await input.fetchRoutes(input.from, to);
    if (response.routes.length > 0) return response;
  } catch {
    // A straight line below: the resident still gets a named place and a direction.
  }
  return { routes: [straightLine(input.from, to)], fallback: true };
}

/**
 * The first clean route to the nearest place; otherwise the next place, up to
 * three; otherwise the nearest place's route with the fewest problems, and
 * what they are.
 */
async function chooseRoute(candidates: Destination[], input: SearchInput): Promise<SafeRouteResult> {
  if (candidates.length === 0) return { status: "none", problems: [], fallback: false };

  const dangerZones = input.zones.filter((zone) => isUnderAlert(input.statusOf(zone.id)));
  const pins = blockingPins(input.pins, input.now);

  let nearest: SafeRouteResult | null = null;
  for (const destination of candidates.slice(0, MAX_CANDIDATES)) {
    const response = await routesTo(input, destination);
    let best: { route: RouteOption; problems: RouteProblem[] } | null = null;
    for (const route of response.routes) {
      const problems = routeProblems(route.polyline, { dangerZones, pins, startZoneId: input.startZoneId });
      if (problems.length === 0) {
        return { status: "found", destination, route, problems: [], fallback: response.fallback };
      }
      if (!best || problems.length < best.problems.length) best = { route, problems };
    }
    nearest ??= { status: "found", destination, route: best?.route, problems: best?.problems ?? [], fallback: response.fallback };
  }
  return nearest as SafeRouteResult;
}

/** Likely sites from OpenStreetMap, for a barangay with no confirmed centre in reach. A failed search is an empty one. */
async function likelySites(from: LatLng, fetchLikelySites: () => Promise<CandidateSite[]>): Promise<Destination[]> {
  let sites: CandidateSite[] = [];
  try {
    const found = await fetchLikelySites();
    if (Array.isArray(found)) sites = found;
  } catch {
    // The search is a bonus; nothing found is a fair answer.
  }
  return withinReach(sites, from, (site) => site).map(
    (site): Destination => ({ kind: "likely", site, name: site.name, lat: site.lat, lng: site.lng })
  );
}

/**
 * The nearest usable place from where the resident is, and the way to it.
 * Confirmed centres come first; likely sites only when no confirmed centre is
 * within 10 km, and they are marked as likely by their `kind`.
 */
export async function findSafeDestination(input: SearchInput & { fetchLikelySites: () => Promise<CandidateSite[]> }): Promise<SafeRouteResult> {
  let candidates = usableCentres(input);
  if (candidates.length === 0) candidates = await likelySites(input.from, input.fetchLikelySites);
  return chooseRoute(candidates, input);
}

/** The barangays with no alert at all within 10 km, nearest first, as places to walk to (the barangay's point). */
export function usableAreas({
  from,
  zones,
  statusOf,
}: {
  from: LatLng;
  zones: Zone[];
  statusOf: (zoneId: string) => ZoneStatus;
}): Destination[] {
  const safe = zones.filter((zone) => statusOf(zone.id) === "safe");
  return withinReach(safe, from, (zone) => zone).map(
    (zone): Destination => ({ kind: "area", zone, name: zone.name, lat: zone.lat, lng: zone.lng })
  );
}

/** The nearest barangay with no alert at all, measured from the resident, and the way to its point. */
export async function findSafeArea(input: SearchInput): Promise<SafeRouteResult> {
  return chooseRoute(usableAreas(input), input);
}

/** The way to a place the resident picked, checked like any other; no search for a better one. */
export async function routeToDestination(destination: Destination, input: SearchInput): Promise<SafeRouteResult> {
  return chooseRoute([destination], input);
}
