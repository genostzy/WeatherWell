import { describe, it, expect } from "vitest";
import { buildOverpassQuery, parseOverpass } from "./osm-candidates";

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
