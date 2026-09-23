import { describe, it, expect } from "vitest";
import { buildElevationUrl, parseElevation, describeElevation } from "./elevation";

describe("elevation", () => {
  it("asks Open-Meteo for both points in one request", () => {
    expect(buildElevationUrl([{ lat: 16.02, lng: 120.43 }, { lat: 16.03, lng: 120.44 }])).toBe(
      "https://api.open-meteo.com/v1/elevation?latitude=16.02,16.03&longitude=120.43,120.44"
    );
  });

  it("reads the elevations back, or null when the reply is not what it should be", () => {
    expect(parseElevation({ elevation: [12.4, 20] }, 2)).toEqual([12.4, 20]);
    expect(parseElevation({ elevation: [12.4] }, 2)).toBeNull();
    expect(parseElevation({ error: true }, 2)).toBeNull();
    expect(parseElevation({ elevation: [null, 3] }, 2)).toBeNull();
  });

  it("warns a resident standing clearly lower than their barangay centre", () => {
    const text = describeElevation(8, 14);
    expect(text.en).toMatch(/about 6 m lower than your barangay centre/i);
    expect(text.en).toMatch(/move to higher ground early/i);
    expect(text.fil).toMatch(/6 m/);
  });

  it("reassures, without promising safety, when higher", () => {
    const text = describeElevation(20, 14);
    expect(text.en).toMatch(/about 6 m higher/i);
    expect(text.en).not.toMatch(/safe/i);
  });

  it("calls it about level within 2 m", () => {
    expect(describeElevation(14.5, 13).en).toMatch(/about the same height/i);
  });
});
