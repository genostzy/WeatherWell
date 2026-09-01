import { describe, it, expect } from "vitest";
import { MOCK_ZONES, MOCK_ALERTS, getActiveAlertForZone } from "./mock-data";
import { t } from "./i18n";

describe("mock-data", () => {
  it("has at least three zones so selection and listing are meaningful", () => {
    expect(MOCK_ZONES.length).toBeGreaterThanOrEqual(3);
  });

  it("gives every zone the fields the UI reads", () => {
    for (const zone of MOCK_ZONES) {
      expect(zone.id).toBeTruthy();
      expect(zone.name).toBeTruthy();
      expect(zone.evacuationCenterName).toBeTruthy();
      expect(zone.hotlineNumber).toBeTruthy();
      expect(zone.evacuationRouteText.en).toBeTruthy();
      expect(zone.evacuationRouteText.fil).toBeTruthy();
    }
  });

  it("localizes every alert message in both baseline languages", () => {
    for (const alert of MOCK_ALERTS) {
      expect(t(alert.message, "en")).toBeTruthy();
      expect(t(alert.message, "fil")).toBeTruthy();
      expect(t(alert.message, "en")).not.toBe(t(alert.message, "fil"));
    }
  });

  it("returns the active alert for a zone that has one", () => {
    const alert = getActiveAlertForZone("zone-1");
    expect(alert).toBeDefined();
    expect(alert?.zoneId).toBe("zone-1");
    expect(alert?.isActive).toBe(true);
  });

  it("returns undefined for a real zone with no active alert", () => {
    expect(MOCK_ZONES.some((z) => z.id === "zone-3")).toBe(true);
    expect(getActiveAlertForZone("zone-3")).toBeUndefined();
  });

  it("every mock alert references a real mock zone", () => {
    const zoneIds = new Set(MOCK_ZONES.map((z) => z.id));
    for (const alert of MOCK_ALERTS) {
      expect(zoneIds.has(alert.zoneId)).toBe(true);
    }
  });
});

describe("t", () => {
  it("returns the requested language", () => {
    expect(t({ en: "Hello", fil: "Kumusta" }, "fil")).toBe("Kumusta");
  });

  it("falls back to English when a translation is empty", () => {
    expect(t({ en: "Hello", fil: "" }, "fil")).toBe("Hello");
  });
});
