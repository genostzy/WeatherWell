import { describe, it, expect } from "vitest";
import { hasRealHotline, hasRealEvacuationCenter } from "./zone-data-quality";
import type { Zone } from "@/lib/types";

const ZONE: Zone = {
  id: "zone-1",
  psgcBarangayCode: "0105528012",
  name: "Barangay Nilombot, Mapandan",
  municipalityName: "Mapandan",
  provinceName: "Pangasinan",
  evacuationCenterName: "Nilombot Elementary School",
  evacuationRouteText: { en: "Head to the barangay road.", fil: "Dumaan sa barangay road." },
  lat: 16.0288,
  lng: 120.4366,
  evacuationCenterLat: 16.0295,
  evacuationCenterLng: 120.436,
  evacuationRoutePath: [[16.0288, 120.4366]],
  hotlineNumber: "09171234567",
  centerStatus: "space_available",
  evacuationCenterCapacity: 300,
};

describe("hasRealHotline", () => {
  it("accepts a real number", () => {
    expect(hasRealHotline(ZONE)).toBe(true);
  });

  it("rejects the nationwide seed's all-zero placeholder", () => {
    // 41,798 zones carry exactly this. Rendering it as a tappable hotline
    // means a resident dials nothing during a flood.
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "00000000000" })).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "" })).toBe(false);
  });

  it("rejects whitespace only", () => {
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "   " })).toBe(false);
  });

  it("accepts an unusual but non-empty number rather than guessing at format", () => {
    // Review Focus 5: a real barangay may use a short landline or a spaced
    // number. This predicate's job is to catch the placeholder, not to
    // validate Philippine dialling plans — a wrong format still reaches a
    // human, a rejected real number does not.
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "075-632-1234" })).toBe(true);
    expect(hasRealHotline({ ...ZONE, hotlineNumber: "117" })).toBe(true);
  });
});

describe("hasRealEvacuationCenter", () => {
  it("accepts a named centre", () => {
    expect(hasRealEvacuationCenter(ZONE)).toBe(true);
  });

  it("rejects the seed's nameless placeholder", () => {
    expect(hasRealEvacuationCenter({ ...ZONE, evacuationCenterName: "" })).toBe(false);
  });

  it("rejects whitespace only", () => {
    expect(hasRealEvacuationCenter({ ...ZONE, evacuationCenterName: "  " })).toBe(false);
  });
});
