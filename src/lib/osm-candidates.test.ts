import { describe, it, expect } from "vitest";
import { buildNominatimUrl, buildOverpassQuery, parseNominatim, parseOverpass } from "./osm-candidates";

describe("OpenStreetMap candidate centres (idea 10)", () => {
  it("asks for schools, halls, community centres and covered courts near the barangay", () => {
    const q = buildOverpassQuery(16.0288, 120.4366);
    expect(q).toContain("[out:json]");
    expect(q).toContain("around:2000,16.0288,120.4366");
    for (const tag of ["school", "townhall", "community_centre", "sports_centre"]) expect(q).toContain(tag);
  });

  it("keeps named places, nearest first, at most five, with their kind", () => {
    const reply = {
      elements: [
        { type: "node", lat: 16.04, lon: 120.44, tags: { amenity: "school", name: "Far School" } },
        { type: "way", center: { lat: 16.029, lon: 120.437 }, tags: { amenity: "townhall", name: "Barangay Hall" } },
        { type: "node", lat: 16.03, lon: 120.436, tags: { amenity: "school" } },
        ...Array.from({ length: 6 }, (_, i) => ({
          type: "node",
          lat: 16.05 + i / 100,
          lon: 120.45,
          tags: { leisure: "sports_centre", name: `Court ${i}` },
        })),
      ],
    };
    const out = parseOverpass(reply, 16.0288, 120.4366);
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ name: "Barangay Hall", kind: "hall", lat: 16.029, lng: 120.437 });
    expect(out[1].name).toBe("Far School");
    expect(out[0].distanceM).toBeLessThan(out[1].distanceM);
    expect(out.some((c) => c.name === "")).toBe(false);
  });

  it("reads anything unexpected as no candidates", () => {
    expect(parseOverpass("<html>busy</html>", 16, 120)).toEqual([]);
    expect(parseOverpass({ elements: "x" }, 16, 120)).toEqual([]);
  });
});

describe("Nominatim fallback (Overpass was down all through live testing)", () => {
  it("asks for one amenity inside a ~2 km box around the barangay", () => {
    expect(buildNominatimUrl(16.0288, 120.4366, "school")).toBe(
      "https://nominatim.openstreetmap.org/search?amenity=school&viewbox=120.4166,16.0488,120.4566,16.0088&bounded=1&format=jsonv2&limit=10"
    );
  });

  it("reads named places with their kind, nearest first", () => {
    const reply = [
      { name: "Mapandan Central School", type: "school", lat: "16.0279", lon: "120.4534" },
      { name: "Nilombot Elementary School", type: "school", lat: "16.0281", lon: "120.4364" },
      { name: "", type: "school", lat: "16.03", lon: "120.44" },
    ];
    const out = parseNominatim(reply, 16.0288, 120.4366, "school");
    expect(out.map((c) => c.name)).toEqual(["Nilombot Elementary School", "Mapandan Central School"]);
    expect(out[0]).toMatchObject({ kind: "school", lat: 16.0281, lng: 120.4364 });
  });

  it("reads anything else as nothing", () => {
    expect(parseNominatim({ error: "x" }, 16, 120, "school")).toEqual([]);
  });
});
