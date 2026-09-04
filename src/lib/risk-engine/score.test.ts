import { describe, it, expect } from "vitest";
import { computeZoneState, buildZoneInputForZone } from "./score";
import { MOCK_ZONES, getActiveAlertForZone } from "../mock-data";
import type { ZoneInput } from "./types";

const FLAT_HISTORY = new Array(12).fill(10);

function baseInput(overrides: Partial<ZoneInput> = {}): ZoneInput {
  return {
    zoneId: "zone-test",
    rainfallMmPerHour: 0,
    rainfallHistory: FLAT_HISTORY,
    thunderstormWatch: false,
    hazardSusceptibility: { flood: "low", landslide: "low", storm_surge: "low" },
    reportCount24h: 0,
    cascadeFromUpstream: false,
    ...overrides,
  };
}

describe("computeZoneState — rainfall factor", () => {
  it("scores 0 rainfall as no contribution", () => {
    expect(computeZoneState(baseInput({ rainfallMmPerHour: 0 })).riskScore).toBe(0);
  });

  it("scores rainfall at the 50mm/hr saturation point as the full rainfall weight", () => {
    const state = computeZoneState(baseInput({ rainfallMmPerHour: 50 }));
    // rainfall weight is 0.4 of the total 0-100 scale
    expect(state.riskScore).toBe(40);
  });

  it("caps rainfall contribution above the saturation point rather than exceeding it", () => {
    const state = computeZoneState(baseInput({ rainfallMmPerHour: 500 }));
    expect(state.riskScore).toBe(40);
  });

  it("adds a flat bonus for a thunderstorm watch even with zero current rainfall", () => {
    const withWatch = computeZoneState(baseInput({ rainfallMmPerHour: 0, thunderstormWatch: true }));
    const withoutWatch = computeZoneState(baseInput({ rainfallMmPerHour: 0, thunderstormWatch: false }));
    expect(withWatch.riskScore).toBeGreaterThan(withoutWatch.riskScore);
  });
});

describe("computeZoneState — crowd reports factor", () => {
  it("scores zero reports as no contribution", () => {
    expect(computeZoneState(baseInput({ reportCount24h: 0 })).riskScore).toBe(0);
  });

  it("gives partial credit at exactly the auto-alert report threshold", () => {
    const state = computeZoneState(baseInput({ reportCount24h: 3 }));
    // 3 reports / (3 threshold * 3 saturation multiplier) = 1/3 of the 0.3 weight
    expect(state.riskScore).toBe(10);
  });

  it("saturates at 3x the report threshold", () => {
    const atSaturation = computeZoneState(baseInput({ reportCount24h: 9 }));
    const wellAbove = computeZoneState(baseInput({ reportCount24h: 100 }));
    expect(atSaturation.riskScore).toBe(30);
    expect(wellAbove.riskScore).toBe(30);
  });
});

describe("computeZoneState — hazard baseline factor", () => {
  it.each([
    ["low", 0],
    ["medium", 10],
    ["high", 20],
  ] as const)("scores flood susceptibility %s as %i", (level, expected) => {
    const state = computeZoneState(
      baseInput({ hazardSusceptibility: { flood: level, landslide: "low", storm_surge: "low" } })
    );
    expect(state.riskScore).toBe(expected);
  });
});

describe("computeZoneState — cascade factor", () => {
  it("adds the full cascade weight when the upstream zone has an active alert", () => {
    const withCascade = computeZoneState(baseInput({ cascadeFromUpstream: true }));
    const without = computeZoneState(baseInput({ cascadeFromUpstream: false }));
    expect(withCascade.riskScore - without.riskScore).toBe(10);
  });
});

describe("computeZoneState — confidence ladder", () => {
  it("is estimated below the report threshold", () => {
    expect(computeZoneState(baseInput({ reportCount24h: 2 })).confidence).toBe("estimated");
  });

  it("is validated at or above the report threshold", () => {
    expect(computeZoneState(baseInput({ reportCount24h: 3 })).confidence).toBe("validated");
  });
});

describe("computeZoneState — trend detection", () => {
  it("reads escalating when the newer half of rainfall history is well above the older half", () => {
    const history = [2, 2, 2, 2, 2, 2, 10, 10, 10, 10, 10, 10];
    expect(computeZoneState(baseInput({ rainfallHistory: history })).trendDirection).toBe("escalating");
  });

  it("reads improving when the newer half is well below the older half", () => {
    const history = [10, 10, 10, 10, 10, 10, 2, 2, 2, 2, 2, 2];
    expect(computeZoneState(baseInput({ rainfallHistory: history })).trendDirection).toBe("improving");
  });

  it("reads stable when both halves are flat and equal", () => {
    expect(computeZoneState(baseInput({ rainfallHistory: FLAT_HISTORY })).trendDirection).toBe("stable");
  });

  it("reads stable rather than throwing when history has fewer than 12 readings", () => {
    expect(computeZoneState(baseInput({ rainfallHistory: [1, 2, 3] })).trendDirection).toBe("stable");
  });
});

describe("computeZoneState — overall clamp", () => {
  it("never exceeds 100 even when every factor maxes out", () => {
    const state = computeZoneState(
      baseInput({
        rainfallMmPerHour: 999,
        thunderstormWatch: true,
        reportCount24h: 999,
        hazardSusceptibility: { flood: "high", landslide: "high", storm_surge: "high" },
        cascadeFromUpstream: true,
      })
    );
    expect(state.riskScore).toBeLessThanOrEqual(100);
  });
});

/** Stands in for the app's override-aware resolution, reading raw mock data. */
const alertingByMockData = (zoneId: string) => getActiveAlertForZone(zoneId) !== undefined;

describe("buildZoneInputForZone", () => {
  it("marks cascadeFromUpstream true when the immediate upstream zone (via downstreamZoneId) has an active alert", () => {
    // zone-1 -> zone-2 -> zone-3 -> zone-4 per MOCK_ZONES' downstreamZoneId chain;
    // zone-1's mock alert (alert-1) is active, so zone-2's upstream neighbor has an alert.
    const zone2 = MOCK_ZONES.find((z) => z.id === "zone-2")!;
    const input = buildZoneInputForZone(zone2, MOCK_ZONES, alertingByMockData);
    expect(input.zoneId).toBe("zone-2");
    expect(input.cascadeFromUpstream).toBe(true);
  });

  it("follows the caller's notion of an active alert, not the mock data", () => {
    // An operator clearing zone-1 must drop zone-2's cascade contribution;
    // reading mock alerts directly left the dashboard tile disagreeing with
    // the operator's own decision.
    const zone2 = MOCK_ZONES.find((z) => z.id === "zone-2")!;
    const operatorClearedUpstream = (zoneId: string) =>
      zoneId === "zone-1" ? false : alertingByMockData(zoneId);

    expect(buildZoneInputForZone(zone2, MOCK_ZONES, operatorClearedUpstream).cascadeFromUpstream).toBe(
      false
    );
  });

  it("is false for a zone with no upstream neighbor", () => {
    const zone1 = MOCK_ZONES.find((z) => z.id === "zone-1")!;
    const input = buildZoneInputForZone(zone1, MOCK_ZONES, alertingByMockData);
    expect(input.cascadeFromUpstream).toBe(false);
  });
});
