import { describe, it, expect } from "vitest";
import { getHeatIndexCategory, hasElevatedLandslideRisk, isHeavyRainfall, REPORT_THRESHOLD } from "./weather-thresholds";

describe("weather thresholds", () => {
  it("bands the heat index on PAGASA's published cut-offs", () => {
    expect(getHeatIndexCategory(30)).toBe("caution");
    expect(getHeatIndexCategory(33)).toBe("extreme_caution");
    expect(getHeatIndexCategory(42)).toBe("danger");
    expect(getHeatIndexCategory(52)).toBe("extreme_danger");
  });

  it("calls rain heavy from 15 mm in an hour", () => {
    expect(isHeavyRainfall(14.9)).toBe(false);
    expect(isHeavyRainfall(15)).toBe(true);
  });

  it("raises landslide caution only for medium/high susceptibility under heavy rain", () => {
    expect(hasElevatedLandslideRisk("high", 20)).toBe(true);
    expect(hasElevatedLandslideRisk("low", 20)).toBe(false);
    expect(hasElevatedLandslideRisk("high", 5)).toBe(false);
  });

  it("needs three agreeing reports, the same as the alert engine", () => {
    expect(REPORT_THRESHOLD).toBe(3);
  });
});
