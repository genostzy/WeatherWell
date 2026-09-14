import { describe, it, expect } from "vitest";
import { areaLevel } from "./official";

describe("areaLevel", () => {
  it("reads a 10-digit PSGC prefix as a single barangay", () => {
    expect(areaLevel("1234567890")).toBe("barangay");
  });

  it("reads a 7-digit PSGC prefix as a whole municipality", () => {
    expect(areaLevel("1234567")).toBe("municipality");
  });
});
