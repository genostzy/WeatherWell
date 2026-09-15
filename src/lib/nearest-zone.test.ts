import { describe, it, expect } from "vitest";
import { findNearestZone, NEAR_ZONE_METERS } from "./nearest-zone";
import { MOCK_ZONES } from "./mock-data";

describe("findNearestZone", () => {
  it("returns nothing when there are no zones to match against", () => {
    expect(findNearestZone({ lat: 16.03, lng: 120.43 }, [])).toBeNull();
  });

  it("picks the zone whose centre the position is on", () => {
    const zone3 = MOCK_ZONES.find((z) => z.id === "zone-3")!;
    const match = findNearestZone({ lat: zone3.lat, lng: zone3.lng }, MOCK_ZONES)!;
    expect(match.zone.id).toBe("zone-3");
    expect(match.distanceMeters).toBeLessThan(1);
    expect(match.isNear).toBe(true);
  });

  it("picks the closest zone, not the first one in the list", () => {
    // ~1.1 km north of zone-2 (Mangaldan); zone-1 is listed first but farther.
    const match = findNearestZone({ lat: 16.08, lng: 120.4038 }, MOCK_ZONES)!;
    expect(match.zone.id).toBe("zone-2");
    expect(match.distanceMeters).toBeGreaterThan(1000);
    expect(match.distanceMeters).toBeLessThan(1200);
    expect(match.isNear).toBe(true);
  });

  it("still reports the nearest zone, but not as near, for a position far outside coverage", () => {
    // Manila — about 160 km from the Pangasinan demo barangays.
    const match = findNearestZone({ lat: 14.5995, lng: 120.9842 }, MOCK_ZONES)!;
    expect(match.distanceMeters).toBeGreaterThan(150_000);
    expect(match.isNear).toBe(false);
  });

  it("treats exactly the cut-off as near and just past it as not", () => {
    const zones = [{ id: "a", lat: 0, lng: 0 }];
    // One degree of latitude is ~111,195 m on this earth radius.
    const metersPerDegree = 111_194.9266;
    const atCutoff = findNearestZone({ lat: NEAR_ZONE_METERS / metersPerDegree - 1e-7, lng: 0 }, zones)!;
    const pastCutoff = findNearestZone({ lat: (NEAR_ZONE_METERS + 50) / metersPerDegree, lng: 0 }, zones)!;
    expect(atCutoff.isNear).toBe(true);
    expect(pastCutoff.isNear).toBe(false);
  });
});
