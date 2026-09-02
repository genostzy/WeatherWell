import { describe, it, expect } from "vitest";
import { orderZonesWithSelectedFirst } from "./order-zones";
import { MOCK_ZONES } from "./mock-data";

describe("orderZonesWithSelectedFirst", () => {
  it("puts the selected zone first", () => {
    const ordered = orderZonesWithSelectedFirst(MOCK_ZONES, MOCK_ZONES[1].id);
    expect(ordered[0].id).toBe(MOCK_ZONES[1].id);
  });

  it("keeps every zone present, just reordered", () => {
    const ordered = orderZonesWithSelectedFirst(MOCK_ZONES, MOCK_ZONES[2].id);
    expect(ordered).toHaveLength(MOCK_ZONES.length);
    expect(new Set(ordered.map((z) => z.id))).toEqual(new Set(MOCK_ZONES.map((z) => z.id)));
  });

  it("falls back to the given order when the selected id doesn't match any zone", () => {
    const ordered = orderZonesWithSelectedFirst(MOCK_ZONES, "not-a-real-zone");
    expect(ordered).toEqual(MOCK_ZONES);
  });
});
