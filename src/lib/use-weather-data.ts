"use client";

import { useState, useEffect } from "react";

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

/**
 * Hook to fetch weather data for a zone from the API.
 * Polls every 30 minutes. Returns null data when no readings exist yet.
 */
export function useWeatherData(zoneId: string | undefined): {
  current: WeatherReading | null;
  rainfallHistory: number[];
  isLoading: boolean;
  error: unknown;
} {
  const [data, setData] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!zoneId);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!zoneId) return;

    let cancelled = false;
    const controller = new AbortController();

    async function fetchWeather() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/weather?zoneId=${zoneId}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch weather");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled && err instanceof Error && err.name !== "AbortError") {
          setError(err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchWeather();

    // Poll every 30 minutes
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [zoneId]);

  return {
    current: data?.current ?? null,
    rainfallHistory: data?.rainfallHistory ?? [],
    isLoading,
    error,
  };
}
