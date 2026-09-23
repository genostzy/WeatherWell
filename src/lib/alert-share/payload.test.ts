import { describe, it, expect } from "vitest";
import { encodeAlert, decodeAlert, buildShareText, toSharedAlert, type SharedAlert } from "./payload";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const ALERT: SharedAlert = {
  v: 1,
  zoneId: "zone-1",
  zoneName: "Barangay Nilombot, Mapandan",
  severity: "red",
  issuedAt: "2026-09-22T14:32:00.000Z",
  message: "Knee-deep flooding reported along the main road.",
  centerName: "Nilombot Elementary School",
  hotline: "09171234567",
};

describe("encodeAlert / decodeAlert", () => {
  it("round-trips an alert", () => {
    expect(decodeAlert(encodeAlert(ALERT))).toEqual(ALERT);
  });

  it("round-trips non-ASCII Filipino text", () => {
    // Review Focus 1: btoa() throws on anything outside Latin-1, so the
    // encoder must go through UTF-8 bytes. Filipino copy and Spanish-derived
    // barangay names (Señor, Peñaranda) hit this immediately.
    const filipino: SharedAlert = {
      ...ALERT,
      zoneName: "Barangay Señor, Peñaranda",
      message: "Baha hanggang tuhod sa kalsada — lumikas na.",
    };
    expect(decodeAlert(encodeAlert(filipino))).toEqual(filipino);
  });

  it("returns null for a truncated payload rather than throwing", () => {
    // Review Focus 2: carriers split and sometimes clip long SMS bodies.
    const encoded = encodeAlert(ALERT);
    expect(decodeAlert(encoded.slice(0, encoded.length - 10))).toBeNull();
  });

  it("returns null for junk", () => {
    expect(decodeAlert("not-base64!!")).toBeNull();
    expect(decodeAlert("")).toBeNull();
  });

  it("returns null for a payload from a newer app version", () => {
    const future = encodeAlert({ ...ALERT, v: 2 as 1 });
    expect(decodeAlert(future)).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    const partial = encodeAlert({ ...ALERT, zoneName: undefined as unknown as string });
    expect(decodeAlert(partial)).toBeNull();
  });
});

describe("buildShareText", () => {
  it("leads with text a person can act on with no app at all", () => {
    const text = buildShareText(ALERT, "https://weatherwell.app", "en");
    const firstLine = text.split("\n")[0];
    expect(firstLine).toContain("Barangay Nilombot, Mapandan");
    expect(firstLine.toUpperCase()).toContain("RED");
  });

  it("carries the payload in the query, so the page renders as plain HTML with no JavaScript (idea 6)", () => {
    const text = buildShareText(ALERT, "https://weatherwell.app", "en");
    const url = text.split(/\s+/).find((part) => part.startsWith("https://"));
    expect(url).toBeDefined();
    expect(url).toContain("/a?d=");
    expect(decodeAlert(new URL(url!).searchParams.get("d")!)).toEqual(ALERT);
  });
});

describe("toSharedAlert", () => {
  const alert = {
    id: "a1",
    zoneId: "zone-1",
    severity: "red" as const,
    message: { en: "Flooding.", fil: "Baha." },
    source: "manual" as const,
    confidence: "validated" as const,
    issuedAt: "2026-09-23T10:00:00Z",
    isActive: true,
  };
  const zone = FIXTURE_REFERENCE_DATA.zones[0];

  it("carries the localized severity and message", () => {
    const shared = toSharedAlert(alert, { ...zone, hotlineNumber: "09171112222" }, "fil");
    expect(shared.message).toBe("Baha.");
    expect(shared.severityKey).toBe("red");
    expect(shared.hotline).toBe("09171112222");
  });

  it("never forwards a placeholder hotline or centre", () => {
    const placeholder = {
      ...zone,
      hotlineNumber: "00000000000",
      evacuationCenterLat: zone.lat,
      evacuationCenterLng: zone.lng,
      evacuationCenterCapacity: 0,
    };
    const shared = toSharedAlert(alert, placeholder, "en");
    expect(shared.hotline).toBeUndefined();
    expect(shared.centerName).toBeUndefined();
  });
});
