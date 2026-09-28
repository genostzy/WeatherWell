import { describe, it, expect } from "vitest";
import { findWhereYouAre } from "./where-you-are";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const zones = FIXTURE_REFERENCE_DATA.zones;

describe("findWhereYouAre (the barangay GPS puts you in, on the phone)", () => {
  it("is the nearest barangay centre", () => {
    // About 1 km north of the second fixture barangay; the first is about 5 km away.
    const position = { lat: zones[1].lat + 0.009, lng: zones[1].lng };
    expect(findWhereYouAre(position, zones)?.id).toBe(zones[1].id);
  });

  it("is nothing more than 15 km from every barangay", () => {
    expect(findWhereYouAre({ lat: zones[0].lat + 0.5, lng: zones[0].lng + 0.5 }, zones)).toBeNull();
  });

  it("is nothing within 2 km of my barangay's centre, where a phone can't tell neighbours apart", () => {
    // In dense places barangay centres sit ~150 m apart and a phone's position
    // can be off by hundreds of metres: at home, a report stays at home.
    const mine = { ...zones[0], id: "mine", lat: 14, lng: 121 };
    const neighbour = { ...zones[0], id: "neighbour", lat: 14, lng: 121.02 };
    const nearTheNeighbour = { lat: 14, lng: 121.013 }; // ~1.4 km from mine, ~0.75 km from the neighbour
    expect(findWhereYouAre(nearTheNeighbour, [mine, neighbour], mine)).toBeNull();
    expect(findWhereYouAre({ lat: 14, lng: 121.03 }, [mine, neighbour], mine)?.id).toBe("neighbour");
  });

  it("is nothing without a position", () => {
    expect(findWhereYouAre(null, zones)).toBeNull();
  });
});
