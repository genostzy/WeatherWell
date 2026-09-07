import { describe, it, expect } from "vitest";
import { orderZonesWithSelectedFirst } from "./order-zones";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("orderZonesWithSelectedFirst", () => {
  it("puts the selected zone first", () => {
    const ordered = orderZonesWithSelectedFirst(FIXTURE_REFERENCE_DATA.zones, FIXTURE_REFERENCE_DATA.zones[1].id);
    expect(ordered[0].id).toBe(FIXTURE_REFERENCE_DATA.zones[1].id);
  });

  it("keeps every zone present, just reordered", () => {
    const ordered = orderZonesWithSelectedFirst(FIXTURE_REFERENCE_DATA.zones, FIXTURE_REFERENCE_DATA.zones[2].id);
    expect(ordered).toHaveLength(FIXTURE_REFERENCE_DATA.zones.length);
    expect(new Set(ordered.map((z) => z.id))).toEqual(new Set(FIXTURE_REFERENCE_DATA.zones.map((z) => z.id)));
  });

  it("falls back to the given order when the selected id doesn't match any zone", () => {
    const ordered = orderZonesWithSelectedFirst(FIXTURE_REFERENCE_DATA.zones, "not-a-real-zone");
    expect(ordered).toEqual(FIXTURE_REFERENCE_DATA.zones);
  });
});
