"use client";

import useSWR from "swr";

export interface WeatherReading {
  rainfall_mm: number;
  wind_kph: number;
  temperature_c: number;
  humidity_pct: number;
  weather_code: number;
  fetched_at: string;
}

export interface WeatherData {
  zoneId: string;
  current: WeatherReading | null;
  rainfallHistory: number[];
}

const fetcher = async (url: string): Promise<WeatherData> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch weather");
  return res.json();
};

/**
 * Hook to fetch weather data for a zone from the API.
 * Returns mock-like defaults when no real data exists yet.
 */
export function useWeatherData(zoneId: string | undefined): {
  current: WeatherReading | null;
  rainfallHistory: number[];
  isLoading: boolean;
  error: unknown;
} {
  const { data, isLoading, error } = useSWR<WeatherData>(
    zoneId ? `/api/weather?zoneId=${zoneId}` : null,
    fetcher,
    {
      refreshInterval: 30 * 60 * 1000, // 30 minutes
      revalidateOnFocus: true,
      fallbackData: zoneId
        ? { zoneId, current: null, rainfallHistory: [] }
        : undefined,
    }
  );

  return {
    current: data?.current ?? null,
    rainfallHistory: data?.rainfallHistory ?? [],
    isLoading,
    error,
  };
}
