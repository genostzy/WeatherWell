"use client";

import { useState, useEffect } from "react";
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

/**
 * Hook to fetch weather data for a single zone.
 * Returns WeatherOverrides compatible with buildZoneInputForZone.
 * Polls every 30 minutes.
 */
export function useZoneWeather(zoneId: string | undefined): WeatherOverrides & {
  isLoading: boolean;
  current: WeatherReading | null;
} {
  const [data, setData] = useState<ZoneWeatherResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!zoneId) {
      setIsLoading(false);
      return;
    }

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
        // Silent fail — will retry on next interval
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [zoneId]);

  return {
    rainfallMmPerHour: data?.current?.rainfall_mm ?? undefined,
    rainfallHistory: data?.rainfallHistory ?? undefined,
    thunderstormWatch: undefined,
    isLoading,
    current: data?.current ?? null,
  };
}
