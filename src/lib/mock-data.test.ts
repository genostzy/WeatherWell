import { describe, it, expect } from "vitest";
import {
  MOCK_ZONES,
  MOCK_ALERTS,
  MOCK_POIS,
  MOCK_HAZARD_SUSCEPTIBILITY,
  getActiveAlertForZone,
  getPOIsForZone,
  getHazardSusceptibilityForZone,
  getHeatIndexCategory,
  hasElevatedLandslideRisk,
  getFriendlyWeatherRead,
  getRainfallForZone,
  isHeavyRainfall,
} from "./mock-data";
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

  it("returns undefined for a zone id that has no active alert", () => {
    expect(getActiveAlertForZone("zone-does-not-exist")).toBeUndefined();
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

describe("map mock data", () => {
  it("gives every zone real coordinates for the homepage map", () => {
    for (const zone of MOCK_ZONES) {
      expect(typeof zone.lat).toBe("number");
      expect(typeof zone.lng).toBe("number");
      expect(typeof zone.evacuationCenterLat).toBe("number");
      expect(typeof zone.evacuationCenterLng).toBe("number");
      expect(zone.evacuationRoutePath.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("covers all five essential-service categories across the mock POIs", () => {
    const categories = new Set(MOCK_POIS.map((poi) => poi.category));
    expect(categories).toEqual(
      new Set(["health_center", "pharmacy", "market", "water_station", "barangay_office"])
    );
  });

  it("returns only the POIs belonging to the requested zone", () => {
    const zone1Pois = getPOIsForZone("zone-1");
    expect(zone1Pois.length).toBeGreaterThan(0);
    expect(zone1Pois.every((poi) => poi.zoneId === "zone-1")).toBe(true);
  });

  it("gives every zone a risk level for all three hazard types", () => {
    for (const zone of MOCK_ZONES) {
      const risk = getHazardSusceptibilityForZone(zone.id);
      expect(risk.flood).toBeDefined();
      expect(risk.landslide).toBeDefined();
      expect(risk.storm_surge).toBeDefined();
    }
  });

  it("has an entry in MOCK_HAZARD_SUSCEPTIBILITY for every zone", () => {
    for (const zone of MOCK_ZONES) {
      expect(MOCK_HAZARD_SUSCEPTIBILITY[zone.id]).toBeDefined();
    }
  });
});

describe("Current Conditions panel data", () => {
  it("classifies heat index into PAGASA's published bands", () => {
    expect(getHeatIndexCategory(30)).toBe("caution");
    expect(getHeatIndexCategory(33)).toBe("extreme_caution");
    expect(getHeatIndexCategory(42)).toBe("danger");
    expect(getHeatIndexCategory(52)).toBe("extreme_danger");
  });

  it("flags elevated landslide risk only when susceptible AND rain is heavy", () => {
    expect(hasElevatedLandslideRisk("high", 20)).toBe(true);
    expect(hasElevatedLandslideRisk("low", 20)).toBe(false);
    expect(hasElevatedLandslideRisk("high", 5)).toBe(false);
  });

  it("matches isHeavyRainfall's own threshold for every zone's mock rainfall", () => {
    for (const zone of MOCK_ZONES) {
      const mmPerHour = getRainfallForZone(zone.id);
      expect(isHeavyRainfall(mmPerHour)).toBe(mmPerHour >= 15);
    }
  });

  it("gives every zone a bilingual friendly weather read", () => {
    for (const zone of MOCK_ZONES) {
      const read = getFriendlyWeatherRead(zone.id);
      expect(t(read, "en")).toBeTruthy();
      expect(t(read, "fil")).toBeTruthy();
    }
  });
});
