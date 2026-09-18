"use client";

import { useMemo } from "react";
import { useWeatherData } from "@/lib/use-weather-data";
import type { PredictionStep } from "@/lib/types";

/**
 * PAGASA rainfall warning thresholds (mm/hr):
 * - Yellow: ≥ 7.5 mm/hr sustained for 1 hour
 * - Orange: ≥ 15 mm/hr sustained for 1 hour
 * - Red: ≥ 30 mm/hr sustained for 1 hour
 */
const THRESHOLDS = { yellow: 7.5, orange: 15, red: 30 };

interface FloodForecast {
  /** Prediction steps for the next 6 hours (3 × 2-hour windows). */
  steps: PredictionStep[];
  /** Whether the current rainfall trend is increasing. */
  trend: "rising" | "falling" | "stable";
  /** Current rainfall intensity category. */
  currentLevel: "none" | "yellow" | "orange" | "red";
}

/**
 * Computes a simple 6-hour flood forecast from the rainfall history.
 * Uses a 3-hour rolling average trend to extrapolate forward.
 */
export function useFloodForecast(zoneId: string | undefined): FloodForecast | null {
  const { rainfallHistory, isLoading } = useWeatherData(zoneId);

  return useMemo(() => {
    if (isLoading || rainfallHistory.length < 2) return null;

    // Take the last 6 readings (6 hours if hourly)
    const recent = rainfallHistory.slice(-6);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

    // Compute trend from first half vs second half
    const mid = Math.floor(recent.length / 2);
    const firstHalf = recent.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalf = recent.slice(mid).reduce((a, b) => a + b, 0) / (recent.length - mid);
    const trendDelta = secondHalf - firstHalf;

    const trend: FloodForecast["trend"] =
      trendDelta > 2 ? "rising" : trendDelta < -2 ? "falling" : "stable";

    // Determine current level
    const currentLevel: FloodForecast["currentLevel"] =
      avg >= THRESHOLDS.red ? "red" :
      avg >= THRESHOLDS.orange ? "orange" :
      avg >= THRESHOLDS.yellow ? "yellow" : "none";

    // Extrapolate: if rising, project increase; if falling, project decrease
    const steps: PredictionStep[] = [];
    const labels = [
      { timing: { en: "+2 hrs", fil: "+2 oras" }, label: { en: "In 2 hours", fil: "Sa 2 oras" } },
      { timing: { en: "+4 hrs", fil: "+4 oras" }, label: { en: "In 4 hours", fil: "Sa 4 oras" } },
      { timing: { en: "+6 hrs", fil: "+6 oras" }, label: { en: "In 6 hours", fil: "Sa 6 oras" } },
    ];

    for (let i = 1; i <= 3; i++) {
      let projected = avg;
      if (trend === "rising") {
        projected = avg + trendDelta * i * 0.5;
      } else if (trend === "falling") {
        projected = Math.max(0, avg + trendDelta * i * 0.5);
      }

      const severity =
        projected >= THRESHOLDS.red ? "red" :
        projected >= THRESHOLDS.orange ? "orange" :
        projected >= THRESHOLDS.yellow ? "yellow" : "yellow";

      steps.push({
        severity: severity as "yellow" | "orange" | "red" | "evacuate",
        timing: labels[i - 1].timing,
        label: labels[i - 1].label,
      });
    }

    return { steps, trend, currentLevel };
  }, [rainfallHistory, isLoading]);
}
