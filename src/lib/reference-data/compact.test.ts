import { describe, it, expect } from "vitest";
import { compactReferenceData, expandReferenceData } from "./types";
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

  it("stores a placeholder zone without its default fields", () => {
    const [compact] = compactReferenceData(DATA).zones;
    expect(Object.keys(compact).sort()).toEqual(["id", "lat", "lng", "name", "place"]);
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
