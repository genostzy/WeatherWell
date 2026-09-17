"use client";

import useSWR from "swr";
import type { WeatherOverrides } from "@/lib/risk-engine/score";

interface WeatherReading {
  rainfall_mm: number;
  wind_kph: number;
  temperature_c: number;
  humidity_pct: number;
  weather_code: number;
  fetched_at: string;
}

interface ZoneWeatherResponse {
  zoneId: string;
  current: WeatherReading | null;
  rainfallHistory: number[];
}

const fetcher = async (url: string): Promise<ZoneWeatherResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch weather");
  return res.json();
};

/**
 * Hook to fetch weather data for a single zone.
 * Returns WeatherOverrides compatible with buildZoneInputForZone.
 */
export function useZoneWeather(zoneId: string | undefined): WeatherOverrides & {
  isLoading: boolean;
  current: WeatherReading | null;
} {
  const { data, isLoading } = useSWR<ZoneWeatherResponse>(
    zoneId ? `/api/weather?zoneId=${zoneId}` : null,
    fetcher,
    {
      refreshInterval: 30 * 60 * 1000, // 30 minutes
      revalidateOnFocus: true,
    }
  );

  return {
    rainfallMmPerHour: data?.current?.rainfall_mm ?? undefined,
    rainfallHistory: data?.rainfallHistory ?? undefined,
    thunderstormWatch: undefined, // Not available from wttr.in
    isLoading,
    current: data?.current ?? null,
  };
}
