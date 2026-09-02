import { describe, it, expect } from "vitest";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL, SAFE_HEX } from "./zone-status";
import { SEVERITY_HEX } from "./severity";
import type { AlertRecord } from "./types";

function alertWith(severity: AlertRecord["severity"]): AlertRecord {
  return {
    id: "a",
    zoneId: "zone-1",
    severity,
    message: { en: "x", fil: "x" },
    source: "manual",
    confidence: "estimated",
    issuedAt: "2026-01-01T00:00:00.000Z",
    isActive: true,
  };
}

describe("getZoneStatus", () => {
  it("is safe when there is no active alert", () => {
    expect(getZoneStatus(undefined)).toBe("safe");
  });

  it("is cautionary for yellow and orange severities", () => {
    expect(getZoneStatus(alertWith("yellow"))).toBe("cautionary");
    expect(getZoneStatus(alertWith("orange"))).toBe("cautionary");
  });

  it("is dangerous for red", () => {
    expect(getZoneStatus(alertWith("red"))).toBe("dangerous");
  });

  it("is hazardous for evacuate", () => {
    expect(getZoneStatus(alertWith("evacuate"))).toBe("hazardous");
  });
});

describe("getZoneStatusColor", () => {
  it("uses the safe green when there is no alert", () => {
    expect(getZoneStatusColor(undefined)).toBe(SAFE_HEX);
  });

  it("uses the exact severity hex for an active alert — no second color scale", () => {
    expect(getZoneStatusColor(alertWith("red"))).toBe(SEVERITY_HEX.red);
    expect(getZoneStatusColor(alertWith("evacuate"))).toBe(SEVERITY_HEX.evacuate);
  });
});

describe("ZONE_STATUS_LABEL", () => {
  it("has an English and Filipino label for all four statuses", () => {
    for (const status of ["safe", "cautionary", "dangerous", "hazardous"] as const) {
      expect(ZONE_STATUS_LABEL[status].en).toBeTruthy();
      expect(ZONE_STATUS_LABEL[status].fil).toBeTruthy();
    }
  });
});
