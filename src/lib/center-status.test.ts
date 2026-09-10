import { describe, it, expect } from "vitest";
import { deriveCenterStatusFromOccupancy, resolveEffectiveCenterStatus } from "./center-status";

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
  it("derives from occupancy when both capacity and occupancy are known, ignoring the zone default", () => {
    expect(resolveEffectiveCenterStatus("full", 100, 10)).toBe("space_available");
  });

  it("falls back to the zone default when occupancy isn't tracked", () => {
    expect(resolveEffectiveCenterStatus("full", 100, undefined)).toBe("full");
  });

  it("falls back to the zone default when neither capacity nor occupancy is set", () => {
    expect(resolveEffectiveCenterStatus("limited", undefined, undefined)).toBe("limited");
  });

  it("derives from a tracked headcount even when the zone default disagrees", () => {
    // The shape every page must call with: a page that omitted these got the
    // zone default while the rest of the app showed the derived status.
    expect(resolveEffectiveCenterStatus("space_available", 100, 98)).toBe("full");
  });
});
