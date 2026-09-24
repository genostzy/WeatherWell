import { describe, it, expect } from "vitest";
import { areaLevel, isInArea } from "./official";

describe("areaLevel", () => {
  it("reads a 10-digit PSGC prefix as a single barangay", () => {
    expect(areaLevel("1234567890")).toBe("barangay");
  });

  it("reads a 7-digit PSGC prefix as a whole municipality", () => {
    expect(areaLevel("1234567")).toBe("municipality");
  });
});

describe("isInArea", () => {
  it("matches a barangay against its own town's 7-digit prefix — the municipal official's reach", () => {
    // Two different barangays under the same town (Mapandan, PSGC 0105528).
    expect(isInArea("0105528012", "0105528")).toBe(true);
    expect(isInArea("0105528099", "0105528")).toBe(true);
  });

  it("refuses a barangay from a different town", () => {
    // Mangaldan (0105526) is not Mapandan (0105528).
    expect(isInArea("0105526025", "0105528")).toBe(false);
  });

  it("refuses a neighbouring barangay in the same town for a barangay-level area", () => {
    // A barangay official's 10-digit area matches only an exact barangay —
    // sharing the town's first 7 digits is not enough.
    expect(isInArea("0105528099", "0105528012")).toBe(false);
  });

  it("matches a barangay against its own exact 10-digit code", () => {
    expect(isInArea("0105528012", "0105528012")).toBe(true);
  });
});

