import type { PredictionStep } from "@/lib/types";
import type { Severity } from "@/lib/severity";

/**
 * Open-Meteo: free, no key, no account. Replaces the mock weather every
 * resident screen used to show (the weather_readings table was never filled).
 */

export interface LiveWeatherReading {
  /** Rain in the current hour, mm (the rate PAGASA's thresholds are written in). */
  rainfall_mm: number;
  wind_kph: number;
  temperature_c: number;
  /** "Feels like" temperature; the closest free proxy for PAGASA's heat index. */
  apparent_temperature_c: number;
  humidity_pct: number;
  /** WMO weather code; 95, 96 and 99 are thunderstorms. */
  weather_code: number;
  fetched_at: string;
}

export interface ParsedWeather {
  current: LiveWeatherReading | null;
  /** Up to 12 hourly totals, oldest first, ending with the current hour. */
  rainfallHistory: number[];
  /** Up to 6 hourly totals after the current hour. */
  rainfallForecast: number[];
}

export function buildOpenMeteoUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "wind_speed_10m,temperature_2m,apparent_temperature,relative_humidity_2m,weather_code",
    hourly: "precipitation",
    past_hours: "12",
    forecast_hours: "7",
    wind_speed_unit: "kmh",
    timezone: "Asia/Manila",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

interface OpenMeteoReply {
  current?: {
    time?: string;
    wind_speed_10m?: number;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
  };
  hourly?: { time?: string[]; precipitation?: number[] };
}

const EMPTY: ParsedWeather = { current: null, rainfallHistory: [], rainfallForecast: [] };

export function parseOpenMeteo(reply: unknown, fetchedAt: string): ParsedWeather {
  const { current, hourly } = (reply ?? {}) as OpenMeteoReply;
  if (!current?.time || !hourly?.time || !hourly.precipitation) return EMPTY;

  // Both timestamps are local ("YYYY-MM-DDTHH:MM"), so string order is time order.
  const past: number[] = [];
  const future: number[] = [];
  hourly.time.forEach((time, i) => {
    const mm = hourly.precipitation![i] ?? 0;
    if (time <= current.time!) past.push(mm);
    else future.push(mm);
  });
  if (past.length === 0) return EMPTY;

  return {
    current: {
      rainfall_mm: past[past.length - 1],
      wind_kph: current.wind_speed_10m ?? 0,
      temperature_c: current.temperature_2m ?? 0,
      apparent_temperature_c: current.apparent_temperature ?? current.temperature_2m ?? 0,
      humidity_pct: current.relative_humidity_2m ?? 0,
      weather_code: current.weather_code ?? 0,
      fetched_at: fetchedAt,
    },
    rainfallHistory: past.slice(-12),
    rainfallForecast: future.slice(0, 6),
  };
}

/** PAGASA rainfall warning thresholds, mm/hr. */
const THRESHOLDS = { yellow: 7.5, orange: 15, red: 30 };

const WINDOWS: { timing: PredictionStep["timing"]; label: PredictionStep["label"] }[] = [
  { timing: { en: "+2 hrs", fil: "+2 oras" }, label: { en: "In 2 hours", fil: "Sa 2 oras" } },
  { timing: { en: "+4 hrs", fil: "+4 oras" }, label: { en: "In 4 hours", fil: "Sa 4 oras" } },
  { timing: { en: "+6 hrs", fil: "+6 oras" }, label: { en: "In 6 hours", fil: "Sa 6 oras" } },
];

/**
 * The next 6 hours of forecast rain as three 2-hour steps, each rated by its
 * heaviest hour. Empty when nothing reaches the advisory threshold: a
 * forecast of "no warning" is not shown as a yellow one.
 */
export function forecastSteps(rainfallForecast: number[]): PredictionStep[] {
  const steps: PredictionStep[] = [];
  WINDOWS.forEach((window, i) => {
    const hours = rainfallForecast.slice(i * 2, i * 2 + 2);
    if (hours.length === 0) return;
    const peak = Math.max(...hours);
    const severity: Severity | null =
      peak >= THRESHOLDS.red ? "red" : peak >= THRESHOLDS.orange ? "orange" : peak >= THRESHOLDS.yellow ? "yellow" : null;
    if (severity) steps.push({ severity, timing: window.timing, label: window.label });
  });
  return steps;
}

/** WMO codes 95, 96 and 99 are thunderstorms. */
export function isThunderstorm(weatherCode: number): boolean {
  return weatherCode === 95 || weatherCode === 96 || weatherCode === 99;
}
