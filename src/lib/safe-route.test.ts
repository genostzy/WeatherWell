import { describe, it, expect, vi } from "vitest";
import {
  MAX_CANDIDATES,
  PIN_CLEARANCE_M,
  SAFE_RADIUS_M,
  ZONE_CLEARANCE_M,
  blockingPins,
  distanceToRouteMeters,
  findSafeArea,
  findSafeDestination,
  routeProblems,
  usableCentres,
  type LatLng,
} from "./safe-route";
import type { CandidateSite } from "./osm-candidates";
import type { CommunityPin } from "./community-pins";
import type { PinStatusTag } from "./community-pin";
import type { RouteOption, RouteResponse } from "./route-types";
import type { Zone } from "./types";
import type { ZoneStatus } from "./zone-status";

const M_PER_DEG = 111_320;
const HOME: LatLng = { lat: 16.0288, lng: 120.4366 };
const NOW = Date.parse("2026-09-29T12:00:00Z");
const HOUR = 3600 * 1000;

/** A point `east` and `north` of home, in metres. */
function at(east: number, north: number): LatLng {
  return {
    lat: HOME.lat + north / M_PER_DEG,
    lng: HOME.lng + east / (M_PER_DEG * Math.cos((HOME.lat * Math.PI) / 180)),
  };
}

const line = (...points: LatLng[]): [number, number][] => points.map((p) => [p.lat, p.lng]);

/**
 * A barangay whose evacuation centre is at `centre`. Its own point is 5 km
 * east of the centre, so a straight walk to the centre stays clear of it,
 * unless a test moves it with `over`.
 */
function zone(id: string, centre: LatLng, over: Partial<Zone> = {}): Zone {
  const point = { lat: centre.lat, lng: centre.lng + 5000 / (M_PER_DEG * Math.cos((HOME.lat * Math.PI) / 180)) };
  return {
    id,
    psgcBarangayCode: id,
    name: `Barangay ${id}`,
    municipalityName: "Town",
    provinceName: "Province",
    evacuationCenterName: `${id} school`,
    evacuationRouteText: { en: "", fil: "" },
    lat: point.lat,
    lng: point.lng,
    evacuationCenterLat: centre.lat,
    evacuationCenterLng: centre.lng,
    evacuationRoutePath: [],
    hotlineNumber: "09171234567",
    centerStatus: "space_available",
    evacuationCenterCapacity: 200,
    ...over,
  };
}

function pin(id: string, statusTag: PinStatusTag, where: LatLng, over: Partial<CommunityPin> = {}): CommunityPin {
  return {
    id,
    zoneId: "z",
    statusTag,
    caption: "",
    lat: where.lat,
    lng: where.lng,
    upvotes: 0,
    downvotes: 0,
    createdAt: new Date(NOW - HOUR).toISOString(),
    authorId: "u1",
    removed: false,
    ...over,
  };
}

const option = (polyline: [number, number][]): RouteOption => ({ polyline, distanceMeters: 1000, durationSeconds: 720 });

/** A router that answers every request with one straight walk. */
const straightRouter = () =>
  vi.fn(async (from: LatLng, to: LatLng): Promise<RouteResponse> => ({
    routes: [option(line(from, to))],
    fallback: false,
  }));

function input(over: Record<string, unknown> = {}) {
  return {
    from: HOME,
    startZoneId: null as string | null,
    zones: [] as Zone[],
    statusOf: (() => "safe") as (zoneId: string) => ZoneStatus,
    pins: [] as CommunityPin[],
    now: NOW,
    fetchRoutes: straightRouter(),
    fetchLikelySites: vi.fn(async (): Promise<CandidateSite[]> => []),
    ...over,
  };
}

const statuses = (map: Record<string, ZoneStatus>) => (id: string): ZoneStatus => map[id] ?? "safe";

const site = (name: string, where: LatLng): CandidateSite => ({ name, kind: "school", lat: where.lat, lng: where.lng, distanceM: 0 });

describe("distanceToRouteMeters", () => {
  it("measures to the route's segments, not only its corners", () => {
    // The corners are 500 m either side of the pin: only a segment distance says 20 m.
    const route = line(at(0, 0), at(0, 1000));
    expect(distanceToRouteMeters(at(20, 500), route)).toBeCloseTo(20, 0);
  });

  it("measures to the nearer end when the point is past the route's end", () => {
    const route = line(at(0, 0), at(0, 1000));
    expect(distanceToRouteMeters(at(0, 1300), route)).toBeCloseTo(300, 0);
  });

  it("copes with a route of one point, and with none", () => {
    expect(distanceToRouteMeters(at(30, 40), line(at(0, 0)))).toBeCloseTo(50, 0);
    expect(distanceToRouteMeters(at(30, 40), [])).toBe(Infinity);
  });
});

describe("blockingPins", () => {
  it("keeps only standing, recent pins that block a road", () => {
    const where = at(0, 0);
    const keep = [
      pin("road", "road_blocked", where),
      pin("slide", "landslide", where),
      pin("wire", "power_line_down", where),
      pin("impassable", "impassable", where),
    ];
    const drop = [
      pin("removed", "road_blocked", where, { removed: true }),
      pin("old", "road_blocked", where, { createdAt: new Date(NOW - 25 * HOUR).toISOString() }),
      pin("flooded", "flooded", where),
      pin("rising", "rising", where),
      pin("receding", "receding", where),
      pin("other", "other", where),
    ];
    expect(blockingPins([...drop, ...keep], NOW).map((p) => p.id)).toEqual(["road", "slide", "wire", "impassable"]);
  });

  it("counts a pin made 23 hours ago, and one whose clock is a little ahead", () => {
    const where = at(0, 0);
    const pins = [
      pin("recent", "road_blocked", where, { createdAt: new Date(NOW - 23 * HOUR).toISOString() }),
      pin("ahead", "road_blocked", where, { createdAt: new Date(NOW + 5 * 60 * 1000).toISOString() }),
    ];
    expect(blockingPins(pins, NOW)).toHaveLength(2);
  });
});

describe("routeProblems", () => {
  const danger = zone("danger", at(9000, 9000), { lat: at(200, 2000).lat, lng: at(200, 2000).lng });
  const walk = line(at(0, 0), at(0, 3000));

  it("lists a blocking pin near the route with how far along it is, rounded to 10 m, and a barangay under alert near it", () => {
    const p = pin("p", "road_blocked", at(30, 1234));
    expect(routeProblems(walk, { dangerZones: [danger], pins: [p], startZoneId: null })).toEqual([
      { kind: "pin", pin: p, metresFromStart: 1230 },
      { kind: "zone", zone: danger },
    ]);
  });

  it("is quiet when nothing is within reach: 50 m of a pin, 500 m of a barangay", () => {
    const farPin = pin("p", "road_blocked", at(PIN_CLEARANCE_M + 20, 1000));
    const farZone = zone("far", at(9000, 9000), { lat: at(ZONE_CLEARANCE_M + 50, 1000).lat, lng: at(ZONE_CLEARANCE_M + 50, 1000).lng });
    expect(routeProblems(walk, { dangerZones: [farZone], pins: [farPin], startZoneId: null })).toEqual([]);
  });

  it("does not count the barangay the resident starts in", () => {
    const start = zone("start", at(9000, 9000), { lat: at(100, 0).lat, lng: at(100, 0).lng });
    expect(routeProblems(walk, { dangerZones: [start], pins: [], startZoneId: "start" })).toEqual([]);
    expect(routeProblems(walk, { dangerZones: [start], pins: [], startZoneId: "elsewhere" })).toEqual([{ kind: "zone", zone: start }]);
  });
});

describe("usableCentres", () => {
  it("lists the confirmed centres a resident could go to, nearest first", () => {
    const zones = [
      zone("b", at(0, 4000)),
      zone("a", at(0, 2000)),
      zone("unsafe", at(0, 1000)),
      zone("full", at(0, 1500), { centerStatus: "full" }),
      zone("too-far", at(0, SAFE_RADIUS_M + 500)),
      zone("placeholder", at(0, 500), { evacuationCenterName: "" }),
    ];
    const list = usableCentres({ from: HOME, zones, statusOf: statuses({ unsafe: "hazardous" }) });
    expect(list.map((d) => d.name)).toEqual(["a school", "b school"]);
    expect(list[0]).toMatchObject({ kind: "centre", lat: zones[1].evacuationCenterLat, lng: zones[1].evacuationCenterLng });
  });
});

describe("findSafeDestination", () => {
  it("sends a resident whose barangay is under Evacuate to the nearest other centre, not the next barangay in the list", async () => {
    // The Adams case: the list runs own (under Evacuate), then a safe barangay 300 km away, then one 3 km away.
    const own = zone("own", at(0, 100), { lat: at(100, 0).lat, lng: at(100, 0).lng });
    const far = zone("far", at(0, 300_000));
    const near = zone("near", at(0, 3000));

    const result = await findSafeDestination(
      input({ startZoneId: "own", zones: [own, far, near], statusOf: statuses({ own: "hazardous" }) })
    );

    expect(result.status).toBe("found");
    expect(result.destination).toMatchObject({ kind: "centre", name: "near school" });
    // Every route starts inside the barangay under Evacuate; that must not make the route unclean.
    expect(result.problems).toEqual([]);
  });

  it("skips barangays under Warning or Evacuate, and full centres, but not one under a yellow or orange alert", async () => {
    const zones = [
      zone("warning", at(0, 1000)),
      zone("evacuate", at(0, 1500)),
      zone("full", at(0, 2000), { centerStatus: "full" }),
      zone("counted-full", at(0, 2500), { evacuationCenterCapacity: 100, currentOccupancy: 100 }),
      zone("caution", at(0, 4000)),
      zone("safe", at(0, 5000)),
    ];

    const result = await findSafeDestination(
      input({ zones, statusOf: statuses({ warning: "dangerous", evacuate: "hazardous", caution: "cautionary" }) })
    );

    expect(result.destination).toMatchObject({ kind: "centre", name: "caution school" });
  });

  it("prefers a confirmed centre within 10 km to a nearer likely site, and marks likely sites when they are all there is", async () => {
    const likely = vi.fn(async () => [site("Far School", at(0, 15_000)), site("Rizal Elementary", at(0, 1000)), site("Mid Hall", at(0, 9000))]);

    const withCentre = await findSafeDestination(input({ zones: [zone("c", at(0, 8000))], fetchLikelySites: likely }));
    expect(withCentre.destination).toMatchObject({ kind: "centre", name: "c school" });
    expect(likely).not.toHaveBeenCalled();

    const without = await findSafeDestination(input({ zones: [zone("c", at(0, 12_000))], fetchLikelySites: likely }));
    expect(without.destination).toMatchObject({ kind: "likely", name: "Rizal Elementary" });
  });

  it("says nothing is near when nothing is within 10 km", async () => {
    const fetchRoutes = straightRouter();
    const result = await findSafeDestination(
      input({
        zones: [zone("c", at(0, SAFE_RADIUS_M + 1000))],
        fetchLikelySites: async () => [site("Far School", at(0, 20_000))],
        fetchRoutes,
      })
    );
    expect(result).toEqual({ status: "none", problems: [], fallback: false });
    expect(fetchRoutes).not.toHaveBeenCalled();
  });

  it("treats a failed likely-site search as none found", async () => {
    const result = await findSafeDestination(
      input({ zones: [], fetchLikelySites: vi.fn().mockRejectedValue(new Error("Overpass is down")) })
    );
    expect(result).toEqual({ status: "none", problems: [], fallback: false });
  });

  it("takes the first clean alternative", async () => {
    const destination = at(0, 2000);
    const blocker = pin("p1", "road_blocked", at(30, 1000));
    const direct = line(HOME, destination);
    const detour = line(HOME, at(-300, 0), at(-300, 2000), destination);
    const fetchRoutes = vi.fn(async () => ({ routes: [option(direct), option(detour)], fallback: false }));

    const result = await findSafeDestination(input({ zones: [zone("t", destination)], pins: [blocker], fetchRoutes }));

    expect(result.route?.polyline).toEqual(detour);
    expect(result.problems).toEqual([]);
  });

  it("tries the next place when every route to the nearest is blocked", async () => {
    const zones = [zone("near", at(0, 2000)), zone("next", at(4000, 0))];
    const blocker = pin("p1", "road_blocked", at(20, 1000));

    const result = await findSafeDestination(input({ zones, pins: [blocker] }));

    expect(result.destination).toMatchObject({ name: "next school" });
    expect(result.problems).toEqual([]);
  });

  it("asks for routes to at most three places", async () => {
    const zones = [1, 2, 3, 4, 5].map((n) => zone(`z${n}`, at(0, n * 1000)));
    const blockers = [1, 2, 3, 4, 5].map((n) => pin(`p${n}`, "road_blocked", at(10, n * 500)));
    const fetchRoutes = straightRouter();

    await findSafeDestination(input({ zones, pins: blockers, fetchRoutes }));

    expect(fetchRoutes).toHaveBeenCalledTimes(MAX_CANDIDATES);
  });

  it("returns the least-affected route, with its problems, when every route is affected", async () => {
    const destination = at(0, 3000);
    const p1 = pin("p1", "road_blocked", at(0, 1000));
    const p2 = pin("p2", "landslide", at(0, 2500));
    const danger = zone("danger", at(9000, 9000), { lat: at(200, 2000).lat, lng: at(200, 2000).lng });
    // Straight: passes both pins and the barangay. The bend passes one pin and the barangay.
    const straight = line(HOME, destination);
    const bend = line(HOME, at(40, 1000), at(300, 2000), destination);
    const fetchRoutes = vi.fn(async () => ({ routes: [option(straight), option(bend)], fallback: false }));

    const result = await findSafeDestination(
      input({ zones: [zone("only", destination), danger], pins: [p1, p2], statusOf: statuses({ danger: "dangerous" }), fetchRoutes })
    );

    expect(result.status).toBe("found");
    expect(result.route?.polyline).toEqual(bend);
    expect(result.problems).toEqual([
      { kind: "pin", pin: p1, metresFromStart: 1000 },
      { kind: "zone", zone: danger },
    ]);
  });

  it("ignores removed pins, pins over 24 hours old, flood pins that are not Impassable, and pins over 50 m away", async () => {
    const zones = [zone("t", at(0, 2000))];
    const on = at(5, 1000);
    const ignorable = [
      pin("removed", "road_blocked", on, { removed: true }),
      pin("old", "road_blocked", on, { createdAt: new Date(NOW - 25 * HOUR).toISOString() }),
      pin("flooded", "flooded", on),
      pin("rising", "rising", on),
      pin("far", "road_blocked", at(PIN_CLEARANCE_M + 25, 1000)),
    ];
    const quiet = await findSafeDestination(input({ zones, pins: ignorable }));
    expect(quiet.problems).toEqual([]);

    // The same walk with a standing Impassable pin is flagged, so the quiet result above is the filters, not the router.
    const flagged = await findSafeDestination(input({ zones, pins: [...ignorable, pin("wet", "impassable", on)] }));
    expect(flagged.problems).toMatchObject([{ kind: "pin", pin: { id: "wet" } }]);
  });

  it("keeps the destination when the router falls back to a straight line", async () => {
    const zones = [zone("t", at(0, 2000))];
    const straight = vi.fn(async (from: LatLng, to: LatLng): Promise<RouteResponse> => ({
      routes: [{ polyline: line(from, to), distanceMeters: null, durationSeconds: null }],
      fallback: true,
    }));
    const marked = await findSafeDestination(input({ zones, fetchRoutes: straight }));
    expect(marked).toMatchObject({ status: "found", fallback: true, destination: { name: "t school" } });

    // Not even an answer from our own server: still a named place and a line.
    const down = await findSafeDestination(input({ zones, fetchRoutes: vi.fn().mockRejectedValue(new Error("offline")) }));
    expect(down).toMatchObject({ status: "found", fallback: true, destination: { name: "t school" } });
    expect(down.route?.polyline).toEqual(line(HOME, at(0, 2000)));

    // A router that answers with no routes at all is treated the same way.
    const empty = await findSafeDestination(input({ zones, fetchRoutes: vi.fn(async () => ({ routes: [], fallback: false })) }));
    expect(empty).toMatchObject({ status: "found", fallback: true });
  });

  it("checks a straight line the same way as a route", async () => {
    const zones = [zone("t", at(0, 2000))];
    const blocker = pin("p1", "road_blocked", at(10, 1000));
    const straight = vi.fn(async (from: LatLng, to: LatLng): Promise<RouteResponse> => ({
      routes: [{ polyline: line(from, to), distanceMeters: null, durationSeconds: null }],
      fallback: true,
    }));
    const result = await findSafeDestination(input({ zones, pins: [blocker], fetchRoutes: straight }));
    expect(result).toMatchObject({ fallback: true, problems: [{ kind: "pin", pin: { id: "p1" } }] });
  });
});

describe("findSafeArea", () => {
  it("picks the nearest barangay with no alert, not the first in the list", async () => {
    const at2 = (id: string, where: LatLng) => zone(id, at(9000, 9000), { lat: where.lat, lng: where.lng });
    const zones = [
      at2("first-but-far", at(0, 300_000)),
      at2("own", at(0, 100)),
      at2("yellow", at(0, 2000)),
      at2("nearest-safe", at(4000, 0)),
      at2("later-safe", at(0, 6000)),
    ];

    const result = await findSafeArea({
      ...input({ startZoneId: "own", zones, statusOf: statuses({ own: "hazardous", yellow: "cautionary" }) }),
    });

    expect(result.status).toBe("found");
    expect(result.destination).toMatchObject({ kind: "area", name: "Barangay nearest-safe", lat: at(4000, 0).lat, lng: at(4000, 0).lng });
  });

  it("says nothing is near when no barangay within 10 km is free of alerts", async () => {
    const zones = [zone("a", at(0, 1000), { lat: at(0, 1000).lat, lng: at(0, 1000).lng })];
    const result = await findSafeArea(input({ zones, statusOf: statuses({ a: "cautionary" }) }));
    expect(result).toEqual({ status: "none", problems: [], fallback: false });
  });
});
