"use client";

import { useMemo } from "react";
import { useWeatherData } from "@/lib/use-weather-data";
import { forecastSteps } from "@/lib/open-meteo";
import type { PredictionStep } from "@/lib/types";

/**
 * The next 6 hours as rainfall-warning steps, from Open-Meteo's real forecast
 * (it used to extrapolate a trend line from past rain, which cannot see a
 * storm coming). Null while loading; no steps when nothing reaches a warning.
 */
export function useFloodForecast(zoneId: string | undefined): { steps: PredictionStep[] } | null {
  const { rainfallForecast, isLoading } = useWeatherData(zoneId);
  return useMemo(
    () => (isLoading ? null : { steps: forecastSteps(rainfallForecast) }),
    [rainfallForecast, isLoading]
  );
}
