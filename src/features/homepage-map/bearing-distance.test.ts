import { describe, it, expect } from "vitest";
import { getBearingAndDistance } from "./bearing-distance";

describe("getBearingAndDistance", () => {
  it("computes distance in meters using the haversine formula", () => {
    // ~111m per 0.001 degree of latitude at this latitude
    const result = getBearingAndDistance({ lat: 14.656, lng: 121.1015 }, { lat: 14.657, lng: 121.1005 });
    expect(result.distanceMeters).toBeGreaterThan(100);
    expect(result.distanceMeters).toBeLessThan(200);
  });

  it("labels due north as N", () => {
    const result = getBearingAndDistance({ lat: 14.0, lng: 121.0 }, { lat: 14.01, lng: 121.0 });
    expect(result.compassLabel).toBe("N");
  });

  it("labels due east as E", () => {
    const result = getBearingAndDistance({ lat: 14.0, lng: 121.0 }, { lat: 14.0, lng: 121.01 });
    expect(result.compassLabel).toBe("E");
  });

  it("returns zero distance for the same point", () => {
    const point = { lat: 14.656, lng: 121.1015 };
    expect(getBearingAndDistance(point, point).distanceMeters).toBeCloseTo(0, 0);
  });
});
