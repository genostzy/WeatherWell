"use client";

import { useState, useEffect } from "react";
import type { LiveWeatherReading } from "@/lib/open-meteo";

export type WeatherReading = LiveWeatherReading;

interface WeatherData {
  zoneId: string;
  current: WeatherReading | null;
  rainfallHistory: number[];
  rainfallForecast: number[];
}

const NO_HOURS: number[] = [];

/**
 * Live weather for a zone from /api/weather (Open-Meteo). Polls every 30
 * minutes. `current` stays null until a reading arrives or if the service
 * is unreachable — screens show "no data", never a made-up zero.
 */
export function useWeatherData(zoneId: string | undefined): {
  current: WeatherReading | null;
  rainfallHistory: number[];
  rainfallForecast: number[];
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
        const res = await fetch(`/api/weather?zoneId=${encodeURIComponent(zoneId!)}`, {
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
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [zoneId]);

  return {
    current: data?.current ?? null,
    rainfallHistory: data?.rainfallHistory ?? NO_HOURS,
    rainfallForecast: data?.rainfallForecast ?? NO_HOURS,
    isLoading,
    error,
  };
}
