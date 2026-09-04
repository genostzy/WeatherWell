import { describe, it, expect } from "vitest";
import { routeCrossesHazard } from "./route-hazard";
import { MOCK_ZONES } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

/**
 * zone-2 and zone-3 (both evacuate/hazardous) are real mock zones
 * with known coordinates and known statuses. They're used here as the
 * "other" hazardous zone a synthetic route can be placed near or far from —
 * decoupling this test from whatever real-world distance the shipped zones'
 * own short local routes happen to sit at (they're real, properly-spaced
 * barangays several km apart; see mock-data.ts and route-hazard.ts).
 */
const zone2 = MOCK_ZONES.find((z) => z.id === "zone-2")!;
const zone3 = MOCK_ZONES.find((z) => z.id === "zone-3")!;

function syntheticZone(evacuationRoutePath: [number, number][]): Zone {
  return {
    id: "synthetic-zone",
    psgcBarangayCode: "0000000000",
    name: "Synthetic Zone",
    evacuationCenterName: "Synthetic Evacuation Center",
    evacuationRouteText: { en: "", fil: "" },
    lat: evacuationRoutePath[0][0],
    lng: evacuationRoutePath[0][1],
    evacuationCenterLat: evacuationRoutePath[0][0],
    evacuationCenterLng: evacuationRoutePath[0][1],
    evacuationRoutePath,
    hotlineNumber: "0",
    centerStatus: "space_available",
    evacuationCenterCapacity: 100,
  };
}

describe("routeCrossesHazard", () => {
  it("returns true when a route waypoint passes near a dangerous/hazardous zone", () => {
    const routeZone = syntheticZone([
      [zone2.lat, zone2.lng],
      [zone2.lat + 0.001, zone2.lng + 0.001],
    ]);
    expect(routeCrossesHazard(routeZone, [routeZone, zone2, zone3])).toBe(true);
  });

  it("returns false when every waypoint stays clear of any dangerous/hazardous zone", () => {
    const routeZone = syntheticZone([
      [zone2.lat + 5, zone2.lng + 5],
      [zone3.lat + 5, zone3.lng + 5],
    ]);
    expect(routeCrossesHazard(routeZone, [routeZone, zone2, zone3])).toBe(false);
  });

  it("ignores the route zone's own status when checking itself", () => {
    // zone-3 itself is at evacuate/hazardous status, but passing just itself
    // (no "other" zones) should never trip.
    expect(routeCrossesHazard(zone3, [zone3])).toBe(false);
  });
});
