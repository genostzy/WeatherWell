import { describe, it, expect } from "vitest";
import { applyCentreOverlay, compactReferenceData, expandReferenceData } from "./types";
import type { ReferenceData } from "./types";
import type { Zone } from "@/lib/types";

const ROUTE = { en: "Go to higher ground.", fil: "Pumunta sa mataas na lugar." };

const placeholder: Zone = {
  id: "zone-0102923008",
  psgcBarangayCode: "0102923008",
  name: "Barangay Subec, Santa Catalina",
  municipalityName: "Santa Catalina",
  provinceName: "Ilocos Sur",
  lat: 17.5808,
  lng: 120.3497,
  evacuationRouteText: ROUTE,
  evacuationRoutePath: [[17.5808, 120.3497]],
  hotlineNumber: "00000000000",
  evacuationCenterName: "Evacuation Centre — Santa Catalina",
  evacuationCenterLat: 17.5808,
  evacuationCenterLng: 120.3497,
  centerStatus: "unknown",
  evacuationCenterCapacity: 0,
};

const pilot: Zone = {
  id: "zone-1",
  psgcBarangayCode: "0105528012",
  name: "Barangay Nilombot, Mapandan",
  municipalityName: "Mapandan",
  provinceName: "Pangasinan",
  lat: 16.0288,
  lng: 120.4366,
  evacuationRouteText: { en: "Head to the school.", fil: "Pumunta sa paaralan." },
  evacuationRoutePath: [[16.0288, 120.4366], [16.0295, 120.436]],
  hotlineNumber: "09171234567",
  downstreamZoneId: "zone-2",
  evacuationCenterName: "",
  evacuationCenterLat: 16.0295,
  evacuationCenterLng: 120.436,
  centerStatus: "limited",
  evacuationCenterCapacity: 300,
  currentOccupancy: 120,
};

const DATA: ReferenceData = {
  zones: [placeholder, pilot],
  pois: [],
  hazards: {
    [placeholder.id]: { flood: "unknown", landslide: "unknown" },
    [pilot.id]: { flood: "high", landslide: "unknown" },
  },
};

describe("compact reference data", () => {
  it("round-trips every zone exactly", () => {
    const raw = JSON.parse(JSON.stringify(compactReferenceData(DATA)));
    expect(expandReferenceData(raw).zones).toEqual(DATA.zones);
  });

  it("stores a placeholder zone as a bare list: code, short name, town, position (half the old file)", () => {
    const [compact] = compactReferenceData(DATA).zones;
    expect(compact).toEqual(["0102923008", "Subec", 0, 17.5808, 120.3497]);
  });

  it("keeps an id or a name that the pattern cannot rebuild", () => {
    const odd = { ...placeholder, id: "zone-x", name: "Poblacion (Ward 1)" };
    const raw = JSON.parse(JSON.stringify(compactReferenceData({ ...DATA, zones: [odd] })));
    expect(expandReferenceData(raw).zones).toEqual([odd]);
  });

  it("still reads format 2, which phones may have cached", () => {
    const format2 = {
      format: 2,
      zones: [{ id: placeholder.id, name: placeholder.name, place: 0, lat: placeholder.lat, lng: placeholder.lng }],
      places: [[placeholder.municipalityName, placeholder.provinceName]],
      routes: [ROUTE],
      pois: [],
      hazards: {},
    };
    expect(expandReferenceData(format2 as never).zones).toEqual([placeholder]);
  });

  it("drops unknown hazard levels, which read back as unknown anyway", () => {
    const raw = compactReferenceData(DATA);
    expect(raw.hazards).toEqual({ [pilot.id]: { flood: "high" } });
  });

  it("still reads the previous file format a service worker may have cached", () => {
    const old = {
      zones: [{ ...pilot, evacuationRouteText: 0 }],
      evacuationRouteTextTable: [pilot.evacuationRouteText],
      pois: [],
      hazards: {},
    };
    expect(expandReferenceData(old).zones).toEqual([pilot]);
  });
});

describe("applyCentreOverlay", () => {
  it("lays live centre rows over the static zones, leaving the rest untouched", () => {
    const zones = expandReferenceData(JSON.parse(JSON.stringify(compactReferenceData(DATA)))).zones;
    const patched = applyCentreOverlay(zones, [
      { zone_id: placeholder.id, name: "Subec Elementary School", lat: 17.582, lng: 120.351, capacity: 200, status: "full", current_occupancy: 190 },
    ]);
    const subec = patched.find((z) => z.id === placeholder.id)!;
    expect(subec).toMatchObject({
      evacuationCenterName: "Subec Elementary School",
      evacuationCenterLat: 17.582,
      evacuationCenterLng: 120.351,
      evacuationCenterCapacity: 200,
      centerStatus: "full",
      currentOccupancy: 190,
    });
    expect(patched.find((z) => z.id === pilot.id)).toBe(zones.find((z) => z.id === pilot.id));
  });

  it("drops a stale headcount when the live row has none", () => {
    const patched = applyCentreOverlay([pilot], [
      { zone_id: pilot.id, name: "X", lat: 1, lng: 2, capacity: 10, status: "limited", current_occupancy: null },
    ]);
    expect(patched[0].currentOccupancy).toBeUndefined();
  });
});
