import { describe, it, expect } from "vitest";
import { downstreamChoices, DOWNSTREAM_RADIUS_M } from "./barangay-profile";
import { MOCK_ZONES } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

/** A zone this many metres north of 16°N 120°E. */
function north(id: string, metres: number): Zone {
  return { ...MOCK_ZONES[0], id, name: `Zone ${id}`, municipalityName: "Town", lat: 16 + metres / 111320, lng: 120 };
}

describe("downstreamChoices", () => {
  it("keeps barangays within 20 km, nearest first, never the barangay itself", () => {
    const here = north("here", 0);
    const zones = [here, north("far", 20_500), north("ten", 10_000), north("five", 5_000), north("edge", 19_900)];
    const choices = downstreamChoices(here, zones);
    expect(choices.map((c) => c.id)).toEqual(["five", "ten", "edge"]);
    expect(choices[0]).toEqual({ id: "five", name: "Zone five", municipalityName: "Town", distanceM: expect.closeTo(5000, 0) });
    expect(DOWNSTREAM_RADIUS_M).toBe(20_000);
  });
});
