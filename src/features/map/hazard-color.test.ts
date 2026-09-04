import { describe, it, expect } from "vitest";
import { hazardRiskColor } from "./hazard-color";
import { SEVERITY_HEX } from "@/lib/severity";

describe("hazardRiskColor", () => {
  it("maps low/medium/high onto the existing locked severity hexes", () => {
    expect(hazardRiskColor("low")).toBe(SEVERITY_HEX.yellow);
    expect(hazardRiskColor("medium")).toBe(SEVERITY_HEX.orange);
    expect(hazardRiskColor("high")).toBe(SEVERITY_HEX.red);
  });
});
