import { describe, it, expect } from "vitest";
import { viewportMarkerCap, viewportRadiusDeg, zonesInView } from "./viewport-tracker";
import { MOCK_ZONES } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

const CENTRE: [number, number] = [16.0288, 120.4366];

/**
 * A dense town: 1,600 barangays 500 m apart around the centre, with the
 * barangay at the centre last in the list, the way a real barangay can sit
 * after hundreds of others in the nationwide order.
 */
function denseTown(): Zone[] {
  const zones: Zone[] = [];
  for (let i = -20; i < 20; i++) {
    for (let j = -20; j < 20; j++) {
      if (i === 0 && j === 0) continue;
      zones.push({ ...MOCK_ZONES[0], id: `zone-${i}-${j}`, lat: CENTRE[0] + i * 0.0045, lng: CENTRE[1] + j * 0.0045 });
    }
  }
  zones.push({ ...MOCK_ZONES[0], id: "zone-centre", lat: CENTRE[0], lng: CENTRE[1] });
  return zones;
}

describe("zonesInView (which barangays get a marker)", () => {
  it("keeps the barangay in the middle of the screen at every zoom, however dense the town", () => {
    const zones = denseTown();
    for (let zoom = 10; zoom <= 18; zoom++) {
      const shown = zonesInView(zones, CENTRE, zoom);
      expect(shown.map((z) => z.id), `zoom ${zoom}`).toContain("zone-centre");
      expect(shown.length).toBeLessThanOrEqual(viewportMarkerCap(zoom) + 1);
    }
  });

  it("draws the barangays nearest the middle first when there are more than the cap", () => {
    const shown = zonesInView(denseTown(), CENTRE, 12);
    // Ground distance: a degree of longitude is shorter than one of latitude at 16°N.
    const cosLat = Math.cos((CENTRE[0] * Math.PI) / 180);
    const distance = (z: Zone) => Math.hypot(z.lat - CENTRE[0], (z.lng - CENTRE[1]) * cosLat);
    const distances = shown.map(distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("keeps the resident's own barangay when it is on screen but past the cap", () => {
    const zones = denseTown();
    const edge = zones.find((z) => z.id === "zone-3-3")!;
    const shown = zonesInView(zones, CENTRE, 11, edge.id);
    expect(shown.map((z) => z.id)).toContain(edge.id);
  });

  it("looks at less of the map as it zooms in, as the screen does", () => {
    expect(viewportRadiusDeg(16)).toBeLessThan(viewportRadiusDeg(14));
    expect(viewportRadiusDeg(14)).toBeLessThan(viewportRadiusDeg(12));
  });
});
