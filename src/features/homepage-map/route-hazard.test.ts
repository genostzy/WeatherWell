import { describe, it, expect } from "vitest";
import { routeCrossesHazard } from "./route-hazard";
import { MOCK_ZONES } from "@/lib/mock-data";

const zone1 = MOCK_ZONES.find((z) => z.id === "zone-1")!;
const zone2 = MOCK_ZONES.find((z) => z.id === "zone-2")!;
const zone3 = MOCK_ZONES.find((z) => z.id === "zone-3")!;

describe("routeCrossesHazard", () => {
  it("returns true for a route zone whose path passes near a dangerous/hazardous zone", () => {
    // zone-2 carries a "red" (dangerous) alert, and zone-1's evacuation route
    // path passes within the proximity threshold of zone-2's coordinates —
    // even though zone-1 itself is only "orange" (cautionary). This is the
    // realistic case: your own zone's status isn't the whole safety picture.
    expect(routeCrossesHazard(zone1, MOCK_ZONES)).toBe(true);
  });

  it("returns false when the route zone's own path stays clear of any hazardous zone", () => {
    // zone-2 and zone-3 are each other's nearest dangerous/hazardous
    // neighbor, but both zones' short local evacuation routes stay too
    // close to home to cross the proximity threshold into the other.
    expect(routeCrossesHazard(zone2, MOCK_ZONES)).toBe(false);
    expect(routeCrossesHazard(zone3, MOCK_ZONES)).toBe(false);
  });

  it("ignores the route zone's own status when checking itself", () => {
    // Passing just the route zone itself (no "other" zones) should never trip,
    // even though zone-3 itself is at evacuate/hazardous status.
    expect(routeCrossesHazard(zone3, [zone3])).toBe(false);
  });
});
