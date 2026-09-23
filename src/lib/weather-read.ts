import { isThunderstorm, type LiveWeatherReading } from "@/lib/open-meteo";
import type { LocalizedText } from "@/lib/types";

/** PAGASA's own "heavy rainfall" starts around 7.5 mm in an hour (yellow warning). */
const HEAVY_RAIN_MM = 7.5;
const WINDY_KPH = 20;

const HEAVY_RAIN: LocalizedText = { en: "heavy rain right now", fil: "malakas ang ulan ngayon" };
const THUNDERSTORM: LocalizedText = { en: "thunderstorm in the area", fil: "may bagyong may kulog sa lugar" };
const LIGHT_RAIN: LocalizedText = { en: "light rain", fil: "mahinang ulan" };
const WINDY: LocalizedText = { en: "windy, no rain", fil: "mahangin, walang ulan" };
const CLEAR: LocalizedText = { en: "no rain right now", fil: "walang ulan ngayon" };

/**
 * One short line about the live weather, or null with no reading: a resident
 * must never be told "clear skies" because data is missing.
 */
export function friendlyWeatherRead(current: LiveWeatherReading | null): LocalizedText | null {
  if (!current) return null;
  if (isThunderstorm(current.weather_code)) return THUNDERSTORM;
  if (current.rainfall_mm >= HEAVY_RAIN_MM) return HEAVY_RAIN;
  if (current.rainfall_mm > 0) return LIGHT_RAIN;
  if (current.wind_kph >= WINDY_KPH) return WINDY;
  return CLEAR;
}
