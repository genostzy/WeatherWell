import { describe, it, expect } from "vitest";
import { alertBar, countsTowardAlert, getHeatIndexCategory, hasElevatedLandslideRisk, isHeavyRainfall, REPORT_THRESHOLD } from "./weather-thresholds";

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

describe("countsTowardAlert (found testing the live site)", () => {
  const now = Date.parse("2026-09-24T12:00:00Z");
  const r = (depthLevel: string, hoursAgo: number, isOutlier = false, trustWeight = 0.2) => ({
    depthLevel,
    isOutlier,
    trustWeight,
    reportedAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
  });
  it("counts recent, non-outlier flooding reports only — never dry ones, as the engine does", () => {
    expect(countsTowardAlert(r("knee", 1), now)).toBe(true);
    expect(countsTowardAlert(r("dry", 1), now)).toBe(false);
    expect(countsTowardAlert(r("knee", 7), now)).toBe(false);
    expect(countsTowardAlert(r("knee", 1, true), now)).toBe(false);
  });

  it("leaves out a device whose advisories officials rejected (weight 0, layer 6)", () => {
    expect(countsTowardAlert(r("knee", 1, false, 0), now)).toBe(false);
  });
});

describe("alertBar (Stage 4 calibration: each barangay's own bar)", () => {
  it("is 3 reporters and trust 1.0 at step 0, one reporter and 0.25 trust more a step, to 5 and 2.0", () => {
    expect(alertBar(0)).toEqual({ reporters: 3, trust: 1 });
    expect(alertBar(1)).toEqual({ reporters: 4, trust: 1.25 });
    expect(alertBar(2)).toEqual({ reporters: 5, trust: 1.5 });
    expect(alertBar(4)).toEqual({ reporters: 5, trust: 2 });
  });
});
