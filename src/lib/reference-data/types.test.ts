import { describe, it, expect } from "vitest";
import { applyDetailsOverlay, applyProfileOverlay, toReferenceData } from "./types";
import { MOCK_ZONES } from "@/lib/mock-data";
import { resolveEffectiveCenterStatus } from "@/lib/center-status";

/**
 * The whole point of this route is that the database's normalised rows come
 * back in exactly the shape the app's existing `Zone` type already uses, so
 * no consumer has to change more than an import. These tests pin that shape.
 */
const ZONE_ROW = {
  id: "zone-1",
  psgc_barangay_code: "0105528012",
  name: "Barangay Nilombot, Mapandan",
  municipality_name: "Mapandan",
  province_name: "Pangasinan",
  evacuation_route_text: { en: "Head to the barangay road.", fil: "Dumaan sa barangay road." },
  lat: 16.0288,
  lng: 120.4366,
  evacuation_route_path: [[16.0288, 120.4366], [16.0295, 120.436]] as [number, number][],
  hotline_number: "09171234567",
  downstream_zone_id: "zone-2",
  evacuation_centers: {
    name: "Nilombot Elementary School",
    lat: 16.0295,
    lng: 120.436,
    capacity: 300,
    status: "space_available" as const,
    current_occupancy: null,
  },
};

describe("toReferenceData", () => {
  it("flattens the centre onto the zone, matching the app's Zone type", () => {
    const { zones } = toReferenceData([ZONE_ROW], [], []);
    expect(zones[0]).toMatchObject({
      id: "zone-1",
      psgcBarangayCode: "0105528012",
      evacuationCenterName: "Nilombot Elementary School",
      evacuationCenterLat: 16.0295,
      evacuationCenterCapacity: 300,
      centerStatus: "space_available",
      downstreamZoneId: "zone-2",
    });
  });

  it("carries the localised route text through unchanged", () => {
    const { zones } = toReferenceData([ZONE_ROW], [], []);
    expect(zones[0].evacuationRouteText.fil).toBe("Dumaan sa barangay road.");
  });

  it("omits downstreamZoneId rather than setting it null, since the type says optional", () => {
    // `zone-4` has no downstream zone. `null` would break `if (zone.downstreamZoneId)`
    // consumers less obviously than undefined does, so pin it.
    const { zones } = toReferenceData([{ ...ZONE_ROW, downstream_zone_id: null }], [], []);
    expect(zones[0].downstreamZoneId).toBeUndefined();
  });

  it("groups hazard rows by zone then type, the shape the old per-zone mock-data lookup returned", () => {
    const { hazards } = toReferenceData(
      [ZONE_ROW],
      [],
      [
        { zone_id: "zone-1", hazard_type: "flood", risk_level: "high" },
        { zone_id: "zone-1", hazard_type: "landslide", risk_level: "low" },
      ]
    );
    expect(hazards["zone-1"]).toEqual({ flood: "high", landslide: "low" });
  });

  it("maps points of interest to the camelCase the app uses", () => {
    const { pois } = toReferenceData(
      [ZONE_ROW],
      [{ id: "poi-1", zone_id: "zone-1", category: "health_center", name: "Nilombot Health Center", lat: 16.02, lng: 120.43 }],
      []
    );
    expect(pois[0]).toEqual({
      id: "poi-1",
      zoneId: "zone-1",
      category: "health_center",
      name: "Nilombot Health Center",
      lat: 16.02,
      lng: 120.43,
    });
  });

  it("carries current_occupancy through as currentOccupancy, and a value crossing the full threshold changes the derived status", () => {
    // PRD Gap B: an operator's headcount write is worthless if reference data
    // never selects it back out. Pin the field actually reaching the Zone,
    // and that it changes the derived status even though the manual
    // centerStatus column still says "space_available" (300 * 0.95 = 285).
    const { zones } = toReferenceData(
      [{ ...ZONE_ROW, evacuation_centers: { ...ZONE_ROW.evacuation_centers, current_occupancy: 285 } }],
      [],
      []
    );
    expect(zones[0].currentOccupancy).toBe(285);
    expect(zones[0].centerStatus).toBe("space_available");
    expect(
      resolveEffectiveCenterStatus(zones[0].centerStatus, zones[0].evacuationCenterCapacity, zones[0].currentOccupancy)
    ).toBe("full");
  });

  it("maps a null current_occupancy to undefined, so the effective status falls back to the manual centerStatus", () => {
    // ZONE_ROW's fixture already has current_occupancy: null — this is the
    // "no live headcount recorded yet" case, which must NOT be read as 0.
    const { zones } = toReferenceData([ZONE_ROW], [], []);
    expect(zones[0].currentOccupancy).toBeUndefined();
    expect(
      resolveEffectiveCenterStatus(zones[0].centerStatus, zones[0].evacuationCenterCapacity, zones[0].currentOccupancy)
    ).toBe(zones[0].centerStatus);
  });

  it("uses fallback defaults when a zone has no evacuation centre (initial load without centres)", () => {
    // With ~42k zones, evacuation centres are loaded on-demand rather than
    // in the initial bulk fetch. Zones without centres get sensible defaults.
    const { zones } = toReferenceData([{ ...ZONE_ROW, evacuation_centers: null }], [], []);
    expect(zones[0].evacuationCenterName).toBe("");
    expect(zones[0].centerStatus).toBe("space_available");
    expect(zones[0].evacuationCenterLat).toBe(ZONE_ROW.lat);
  });
});


describe("applyProfileOverlay", () => {
  it("lays an official's levels and downstream link over the static data", () => {
    const [a, b] = MOCK_ZONES;
    const data = { zones: [a, b], hazards: { [a.id]: { flood: "unknown" as const, dam_release: "low" as const } } };
    const out = applyProfileOverlay(data, [
      { id: a.id, flood: "high", landslide: "low", storm_surge: "unknown", downstream_zone_id: b.id },
    ]);
    expect(out.hazards[a.id]).toEqual({ flood: "high", landslide: "low", storm_surge: "unknown", dam_release: "low" });
    expect(out.zones[0].downstreamZoneId).toBe(b.id);
    expect(out.zones[1]).toBe(b);
    const dated = applyProfileOverlay(data, [
      { id: a.id, flood: "high", landslide: "low", storm_surge: "unknown", downstream_zone_id: null, set_at: "2026-09-30T06:00:00Z" },
    ]);
    expect(dated.zones[0].profileSetAt).toBe("2026-09-30T06:00:00Z");
  });

  it("clears a link set to none, and an empty feed changes nothing", () => {
    const [a] = MOCK_ZONES;
    const linked = { ...a, downstreamZoneId: "somewhere" };
    const data = { zones: [linked], hazards: {} };
    const out = applyProfileOverlay(data, [
      { id: a.id, flood: "low", landslide: "low", storm_surge: "low", downstream_zone_id: null },
    ]);
    expect(out.zones[0].downstreamZoneId).toBeUndefined();
    expect(applyProfileOverlay(data, [])).toBe(data);
  });
});

describe("applyDetailsOverlay", () => {
  it("lays an official's numbers and instructions over the static barangay", () => {
    const [zone] = MOCK_ZONES;
    const route = { en: "Go to the school.", fil: "Pumunta sa paaralan." };
    const [patched] = applyDetailsOverlay(
      [zone],
      [{ id: zone.id, hotline_number: "0917 123 4567", extra_hotlines: ["(075) 522-1234"], evacuation_route_text: route }]
    );
    expect(patched.hotlineNumber).toBe("0917 123 4567");
    expect(patched.extraHotlines).toEqual(["(075) 522-1234"]);
    expect(patched.evacuationRouteText).toEqual(route);
  });

  it("leaves every other barangay as the same object, and an empty feed changes nothing", () => {
    const [a, b] = MOCK_ZONES;
    const withExtras = { ...a, extraHotlines: ["0918 765 4321"] };
    const out = applyDetailsOverlay(
      [withExtras, b],
      [{ id: a.id, hotline_number: "0917 123 4567", extra_hotlines: [], evacuation_route_text: a.evacuationRouteText }]
    );
    expect(out[1]).toBe(b);
    // An official who cleared the extra numbers: none are left behind.
    expect(out[0].extraHotlines).toBeUndefined();
    const zones = [a, b];
    expect(applyDetailsOverlay(zones, [])).toBe(zones);
  });
});
