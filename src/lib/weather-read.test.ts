import { describe, it, expect } from "vitest";
import { friendlyWeatherRead } from "./weather-read";
import type { LiveWeatherReading } from "./open-meteo";

const CALM: LiveWeatherReading = {
  rainfall_mm: 0,
  wind_kph: 5,
  temperature_c: 28,
  apparent_temperature_c: 31,
  humidity_pct: 70,
  weather_code: 1,
  fetched_at: "2026-09-23T11:00:00.000Z",
};

describe("friendlyWeatherRead", () => {
  it("says nothing without a real reading, instead of claiming clear skies", () => {
    expect(friendlyWeatherRead(null)).toBeNull();
  });

  it("calls out heavy rain on PAGASA's own threshold", () => {
    expect(friendlyWeatherRead({ ...CALM, rainfall_mm: 16 })?.en).toMatch(/heavy rain/i);
  });

  it("calls out a thunderstorm", () => {
    expect(friendlyWeatherRead({ ...CALM, weather_code: 95 })?.en).toMatch(/thunderstorm/i);
  });

  it("reads light rain as light rain", () => {
    expect(friendlyWeatherRead({ ...CALM, rainfall_mm: 1.2 })?.en).toMatch(/light rain/i);
  });

  it("reads strong wind", () => {
    expect(friendlyWeatherRead({ ...CALM, wind_kph: 30 })?.en).toMatch(/windy/i);
  });

  it("reads calm, dry weather as clear", () => {
    expect(friendlyWeatherRead(CALM)?.en).toMatch(/no rain/i);
  });

  it("is always bilingual", () => {
    expect(friendlyWeatherRead({ ...CALM, rainfall_mm: 16 })?.fil).toBeTruthy();
  });
});
