import type { HazardRiskLevel, HazardType, LocalizedText } from "../types";

/**
 * PRD's Current Conditions panel calls for near-real-time rainfall per zone,
 * sourced from PAGASA in later phases — Phase 1 ships mock readings, same as
 * everything else. Values are in mm/hour.
 */
const MOCK_RAINFALL_MM_PER_HOUR: Record<string, number> = {
  "zone-1": 18,
  "zone-2": 32,
  "zone-3": 9,
  "zone-4": 4,
};

export function getRainfallForZone(zoneId: string): number {
  return MOCK_RAINFALL_MM_PER_HOUR[zoneId] ?? 0;
}

/** PAGASA's own "heavy" rainfall classification starts around 15mm in an hour. */
export function isHeavyRainfall(mmPerHour: number): boolean {
  return mmPerHour >= 15;
}

export interface TyphoonTrack {
  name: string;
  category: LocalizedText;
  distanceKm: number;
  bearing: string;
  etaHours: number;
}

/**
 * A typhoon's track is regional, not per-barangay — one shared reading for
 * the whole area, unlike rainfall/flood/landslide which are per zone. `null`
 * models "no active system," which the admin dashboard should show plainly
 * rather than always inventing a storm.
 */
export const MOCK_TYPHOON: TyphoonTrack | null = {
  name: "Basyang",
  category: { en: "Severe Tropical Storm", fil: "Malakas na Bagyong Tropikal" },
  distanceKm: 180,
  bearing: "NE",
  etaHours: 14,
};

/** Same near-real-time cadence as rainfall — PRD's Current Conditions panel groups these together. Values in km/h. */
const MOCK_WIND_KPH: Record<string, number> = {
  "zone-1": 22,
  "zone-2": 35,
  "zone-3": 15,
  "zone-4": 10,
};

export function getWindForZone(zoneId: string): number {
  return MOCK_WIND_KPH[zoneId] ?? 0;
}

/** A forecast watch, not current rain — can be true even where MOCK_RAINFALL_MM_PER_HOUR is still low. */
const MOCK_THUNDERSTORM_WATCH: Record<string, boolean> = {
  "zone-1": true,
  "zone-2": true,
  "zone-3": false,
  "zone-4": false,
};

export function hasThunderstormWatch(zoneId: string): boolean {
  return MOCK_THUNDERSTORM_WATCH[zoneId] ?? false;
}

export type HeatIndexCategory = "caution" | "extreme_caution" | "danger" | "extreme_danger";

/** PAGASA's own published heat index bands (apparent temperature, °C). */
export function getHeatIndexCategory(celsius: number): HeatIndexCategory {
  if (celsius >= 52) return "extreme_danger";
  if (celsius >= 42) return "danger";
  if (celsius >= 33) return "extreme_caution";
  return "caution";
}

/** Weekly-refresh cadence, unlike rainfall/wind/typhoon/thunderstorm above — see Current Conditions panel's per-reading age requirement. */
const MOCK_HEAT_INDEX_C: Record<string, number> = {
  "zone-1": 32,
  "zone-2": 29,
  "zone-3": 33,
  "zone-4": 35,
};

export function getHeatIndexForZone(zoneId: string): number {
  return MOCK_HEAT_INDEX_C[zoneId] ?? 0;
}

/** Also weekly-refresh, same public data family as Heat Index — informational only, no severity or alert attached. */
export const MOCK_DROUGHT_OUTLOOK: LocalizedText = {
  en: "No dry spell expected in the next 30 days.",
  fil: "Walang inaasahang tagtuyot sa susunod na 30 araw.",
};

/** Medium/High landslide susceptibility plus currently-heavy rainfall — the pairing the Current Conditions panel's caution note calls out. Shared by the resident-facing panel and the admin Landslide Risk panel so both read the same rule. */
export function hasElevatedLandslideRisk(susceptibility: HazardRiskLevel, mmPerHour: number): boolean {
  return susceptibility !== "low" && isHeavyRainfall(mmPerHour);
}

const WEATHER_READ_LIGHT_RAIN: LocalizedText = {
  en: "cloudy, with a bit of rain expected later",
  fil: "maulap, may kaunting ulan mamaya",
};
const WEATHER_READ_WINDY: LocalizedText = {
  en: "breezy with scattered clouds",
  fil: "mahangin na may pauwing ulap",
};
const WEATHER_READ_CLEAR: LocalizedText = {
  en: "clear skies, light wind",
  fil: "maaliwalas na langit, mahinang hangin",
};

/** The Personal Status Headline's "Safe" follow-up line (PRD Core Feature #9) — a friendly one-line read derived from this same Current Conditions data, not a separate weather system. */
export function getFriendlyWeatherRead(zoneId: string): LocalizedText {
  const rainfall = getRainfallForZone(zoneId);
  if (rainfall > 0) return WEATHER_READ_LIGHT_RAIN;
  if (getWindForZone(zoneId) >= 20) return WEATHER_READ_WINDY;
  return WEATHER_READ_CLEAR;
}

/**
 * Twelve hourly rainfall readings per zone, oldest first, ending on the same
 * value getRainfallForZone returns — so the admin dashboard's trend line and
 * the resident's Current Conditions reading can never disagree. Phase 2+
 * replaces this with real PAGASA history.
 */
const MOCK_RAINFALL_HISTORY: Record<string, number[]> = {
  "zone-1": [2, 3, 5, 4, 7, 9, 12, 14, 15, 17, 16, 18],
  "zone-2": [4, 6, 9, 12, 15, 19, 22, 26, 28, 30, 31, 32],
  "zone-3": [12, 14, 16, 15, 13, 12, 11, 10, 10, 9, 9, 9],
  "zone-4": [0, 0, 1, 2, 3, 3, 2, 3, 4, 5, 4, 4],
};

export function getRainfallHistoryForZone(zoneId: string): number[] {
  return MOCK_RAINFALL_HISTORY[zoneId] ?? [];
}

export const MOCK_HAZARD_SUSCEPTIBILITY: Record<
  string,
  Record<HazardType, HazardRiskLevel>
> = {
  "zone-1": { flood: "high", landslide: "low", storm_surge: "low" },
  "zone-2": { flood: "high", landslide: "low", storm_surge: "low" },
  "zone-3": { flood: "medium", landslide: "low", storm_surge: "low" },
  "zone-4": { flood: "medium", landslide: "low", storm_surge: "low" },
};

export function getHazardSusceptibilityForZone(
  zoneId: string
): Record<HazardType, HazardRiskLevel> {
  return MOCK_HAZARD_SUSCEPTIBILITY[zoneId];
}
