import { describe, it, expect } from "vitest";
import { routeCrossesHazard } from "./route-hazard";
import { MOCK_ZONES } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

const zone1 = MOCK_ZONES.find((z) => z.id === "zone-1")!;
const zone3 = MOCK_ZONES.find((z) => z.id === "zone-3")!;

describe("routeCrossesHazard", () => {
  it("returns true for a route zone whose path passes near a zone at evacuate/red status", () => {
    // zone-3 carries an "evacuate" severity alert in the mock data, and
    // zone-1's evacuation route path passes within the proximity threshold
    // of zone-3's coordinates.
    expect(routeCrossesHazard(zone1, MOCK_ZONES)).toBe(true);
  });

  it("returns false when no other zone is hazardous", () => {
    const safeOtherZone: Zone = {
      ...zone3,
      id: "zone-test-safe",
      // No alert exists for this id in mock data, so it resolves to "safe" status
      // regardless of coordinates — this isolates the "no hazardous zone" branch.
    };

    expect(routeCrossesHazard(zone1, [zone1, safeOtherZone])).toBe(false);
  });

  it("ignores the route zone's own status when checking itself", () => {
    // Passing just the route zone itself (no "other" zones) should never trip,
    // even though zone-3 itself is at evacuate/hazardous status.
    expect(routeCrossesHazard(zone3, [zone3])).toBe(false);
  });
});
