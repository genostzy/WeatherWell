import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveCenterStatusFromOccupancy,
  resolveEffectiveCenterStatus,
  setZoneOccupancyOverride,
} from "./zone-overrides";

describe("deriveCenterStatusFromOccupancy", () => {
  it("reads space_available below the limited threshold", () => {
    expect(deriveCenterStatusFromOccupancy(100, 69)).toBe("space_available");
  });

  it("reads limited at and above 70% occupancy", () => {
    expect(deriveCenterStatusFromOccupancy(100, 70)).toBe("limited");
    expect(deriveCenterStatusFromOccupancy(100, 94)).toBe("limited");
  });

  it("reads full at and above 95% occupancy", () => {
    expect(deriveCenterStatusFromOccupancy(100, 95)).toBe("full");
    expect(deriveCenterStatusFromOccupancy(100, 150)).toBe("full");
  });

  it("treats zero or negative capacity as full rather than dividing by zero", () => {
    expect(deriveCenterStatusFromOccupancy(0, 0)).toBe("full");
  });
});

describe("resolveEffectiveCenterStatus", () => {
  it("derives from occupancy when both capacity and occupancy are known, ignoring the manual override", () => {
    expect(resolveEffectiveCenterStatus("space_available", "full", 100, 10)).toBe("space_available");
  });

  it("falls back to the manual override when occupancy isn't tracked", () => {
    expect(resolveEffectiveCenterStatus("space_available", "full", 100, undefined)).toBe("full");
  });

  it("falls back to the zone default when neither override nor occupancy is set", () => {
    expect(resolveEffectiveCenterStatus("limited", undefined)).toBe("limited");
  });
});

describe("setZoneOccupancyOverride", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists a headcount to the overrides store", () => {
    setZoneOccupancyOverride("zone-1", 42);
    const stored = JSON.parse(localStorage.getItem("weatherwell.zoneOverrides")!);
    expect(stored["zone-1"].currentOccupancy).toBe(42);
  });

  it("clears the headcount when set to undefined", () => {
    setZoneOccupancyOverride("zone-1", 42);
    setZoneOccupancyOverride("zone-1", undefined);
    const stored = JSON.parse(localStorage.getItem("weatherwell.zoneOverrides")!);
    expect(stored["zone-1"].currentOccupancy).toBeUndefined();
  });
});
