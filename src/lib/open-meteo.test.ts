import { describe, it, expect } from "vitest";
import { buildOpenMeteoUrl, parseOpenMeteo, forecastSteps } from "./open-meteo";

describe("buildOpenMeteoUrl", () => {
  it("asks for the zone's point, current conditions, and 12 past + 6 forecast hours of rain", () => {
    const url = new URL(buildOpenMeteoUrl(16.03, 120.43));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("16.03");
    expect(url.searchParams.get("longitude")).toBe("120.43");
    expect(url.searchParams.get("hourly")).toBe("precipitation");
    expect(url.searchParams.get("past_hours")).toBe("12");
    expect(url.searchParams.get("forecast_hours")).toBe("7");
    expect(url.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(url.searchParams.get("current")).toContain("weather_code");
  });
});

const SAMPLE = {
  current: {
    time: "2026-09-23T19:15",
    wind_speed_10m: 22.5,
    temperature_2m: 27.1,
    apparent_temperature: 31.4,
    relative_humidity_2m: 88,
    weather_code: 95,
  },
  hourly: {
    time: [
      "2026-09-23T08:00", "2026-09-23T09:00", "2026-09-23T10:00", "2026-09-23T11:00",
      "2026-09-23T12:00", "2026-09-23T13:00", "2026-09-23T14:00", "2026-09-23T15:00",
      "2026-09-23T16:00", "2026-09-23T17:00", "2026-09-23T18:00", "2026-09-23T19:00",
      "2026-09-23T20:00", "2026-09-23T21:00", "2026-09-23T22:00", "2026-09-23T23:00",
      "2026-09-24T00:00", "2026-09-24T01:00", "2026-09-24T02:00",
    ],
    precipitation: [0, 0, 0.2, 1, 2, 3, 4, 5, 6, 7, 8, 12.5, 14, 16, 20, 31, 9, 2, 0],
  },
};

describe("parseOpenMeteo", () => {
  it("uses the current hour's rain as the rate, and splits the rest into the past 12 and the next 6 hours", () => {
    const parsed = parseOpenMeteo(SAMPLE, "2026-09-23T11:16:00.000Z");

    expect(parsed.current).toEqual({
      rainfall_mm: 12.5,
      wind_kph: 22.5,
      temperature_c: 27.1,
      apparent_temperature_c: 31.4,
      humidity_pct: 88,
      weather_code: 95,
      fetched_at: "2026-09-23T11:16:00.000Z",
    });
    expect(parsed.rainfallHistory).toEqual([0, 0, 0.2, 1, 2, 3, 4, 5, 6, 7, 8, 12.5]);
    expect(parsed.rainfallForecast).toEqual([14, 16, 20, 31, 9, 2]);
  });

  it("returns no reading rather than a made-up zero when the reply is malformed", () => {
    expect(parseOpenMeteo({}, "2026-09-23T11:16:00.000Z")).toEqual({
      current: null,
      rainfallHistory: [],
      rainfallForecast: [],
    });
  });
});

describe("forecastSteps", () => {
  it("rates each 2-hour window by its heaviest forecast hour, on PAGASA's thresholds", () => {
    const steps = forecastSteps([14, 16, 20, 31, 9, 2]);
    expect(steps.map((s) => s.severity)).toEqual(["orange", "red", "yellow"]);
    expect(steps.map((s) => s.timing.en)).toEqual(["+2 hrs", "+4 hrs", "+6 hrs"]);
  });

  it("forecasts nothing when no window reaches the advisory threshold", () => {
    expect(forecastSteps([0, 1, 2, 0, 0, 3])).toEqual([]);
  });

  it("forecasts nothing without a forecast", () => {
    expect(forecastSteps([])).toEqual([]);
  });
});
