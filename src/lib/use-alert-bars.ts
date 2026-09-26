"use client";

import { useCallback, useEffect, useState } from "react";
import { alertBar } from "@/lib/weather-thresholds";

/**
 * Each barangay's bar for an automatic advisory, as the calibration loop has
 * set it. Until the raised bars arrive, or when they can't be fetched
 * (offline), every barangay reads step 0: the bar most of them keep.
 */
export function useAlertBars(): (zoneId: string) => { reporters: number; trust: number } {
  const [steps, setSteps] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alert-bars")
      .then((res) => (res.ok ? (res.json() as Promise<Record<string, number>>) : null))
      .then((raised) => {
        if (!cancelled && raised) setSteps(raised);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return useCallback((zoneId: string) => alertBar(steps[zoneId] ?? 0), [steps]);
}
