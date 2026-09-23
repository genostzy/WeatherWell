import { describe, it, expect } from "vitest";
import { buildRiverUrl, describeRiver, summarizeRiver } from "./river-forecast";

const days = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];

describe("river forecast (idea 1)", () => {
  it("asks Open-Meteo's flood API for a week back and a week ahead", () => {
    expect(buildRiverUrl(16.0288, 120.4366)).toBe(
      "https://flood-api.open-meteo.com/v1/flood?latitude=16.0288&longitude=120.4366&daily=river_discharge,river_discharge_max&past_days=7&forecast_days=7"
    );
  });

  it("calls a river rising when the week ahead peaks at 1.5x today or more", () => {
    const r = summarizeRiver(
      { daily: { time: days, river_discharge: [40, 42, 50, 70, 95, 80], river_discharge_max: [40, 42, 50, 90, 140, 100] } },
      "2026-09-23"
    );
    expect(r).toEqual({ trend: "rising", todayM3s: 50, peakM3s: 95, peakDate: "2026-09-25", worstM3s: 140 });
  });

  it("calls it falling or steady otherwise", () => {
    const falling = summarizeRiver(
      { daily: { time: days, river_discharge: [60, 55, 50, 44, 40, 36], river_discharge_max: [60, 55, 50, 46, 44, 40] } },
      "2026-09-23"
    );
    expect(falling?.trend).toBe("falling");
    const steady = summarizeRiver(
      { daily: { time: days, river_discharge: [50, 50, 50, 52, 55, 51], river_discharge_max: [50, 50, 50, 56, 60, 58] } },
      "2026-09-23"
    );
    expect(steady?.trend).toBe("steady");
  });

  it("has nothing to say where there is no real river, or no usable data", () => {
    expect(
      summarizeRiver({ daily: { time: days, river_discharge: [0.2, 0.3, 0.4, 2, 3, 2], river_discharge_max: [1, 1, 1, 3, 4, 3] } }, "2026-09-23")
    ).toBeNull();
    expect(summarizeRiver({ error: true }, "2026-09-23")).toBeNull();
    expect(summarizeRiver({ daily: { time: days, river_discharge: [1, 2], river_discharge_max: [] } }, "2026-09-23")).toBeNull();
    expect(summarizeRiver({ daily: { time: days, river_discharge: [40, 42, null, 70, 95, 80], river_discharge_max: [40, 42, 50, 90, 140, 100] } }, "2026-09-23")).toBeNull();
  });
});

describe("describeRiver", () => {
  const rising = { trend: "rising" as const, todayM3s: 50, peakM3s: 95, peakDate: "2026-09-25", worstM3s: 140 };

  it("says a rising river plainly, with when and how much", () => {
    expect(describeRiver(rising, "en")).toBe("Rising: up to 95 m³/s by Fri (about 1.9× today). Watch low ground near the river.");
    expect(describeRiver(rising, "fil")).toMatch(/Tumataas/);
  });

  it("keeps steady and falling short", () => {
    expect(describeRiver({ ...rising, trend: "steady" }, "en")).toBe("Steady, about 50 m³/s");
    expect(describeRiver({ ...rising, trend: "falling" }, "en")).toBe("Falling, now 50 m³/s");
  });
});
