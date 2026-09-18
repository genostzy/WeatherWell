"use client";

import { useState, useEffect, useRef } from "react";
import type { LocalizedText } from "./types";

export interface TyphoonTrack {
  id: string;
  name: string;
  international_name: string | null;
  category: LocalizedText;
  positions: Array<{
    lat: number;
    lng: number;
    description: string | null;
    outsidePar: boolean;
    maxWindsKph: number | null;
    gustinessKph: number | null;
    pressureHpa: number | null;
    movement: {
      direction: string | null;
      speedKph: number | null;
    };
    time: string;
  }>;
  bulletin_number: number | null;
  is_final: boolean;
  issued_at: string | null;
  next_bulletin_at: string | null;
  headline: string | null;
  max_winds_kph: number | null;
  gustiness_kph: number | null;
  pressure_hpa: number | null;
  movement_direction: string | null;
  movement_speed_kph: number | null;
  wind_signal: number;
  signals: Array<{
    signalLevel: number;
    areas: Array<{
      locationName: string;
      partialDescriptor: string | null;
      raw: string;
    }>;
  }>;
  source: string;
  fetched_at: string;
}

interface TyphoonResponse {
  track: TyphoonTrack | null;
  error?: string;
}

/** How often to re-fetch when there IS an active storm (3 hours) */
const ACTIVE_POLL_MS = 3 * 60 * 60 * 1000;
/** How often to re-fetch when there is NO active storm (6 hours) */
const IDLE_POLL_MS = 6 * 60 * 60 * 1000;

/**
 * Hook to fetch the currently active typhoon track from the API.
 * Polls more frequently during active storms (3h) vs idle (6h).
 */
export function useTyphoon() {
  const [track, setTrack] = useState<TyphoonTrack | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchTrack() {
      try {
        const res = await fetch("/api/typhoon", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: TyphoonResponse = await res.json();
        if (!cancelled && mountedRef.current) {
          setTrack(data.track);
          setError(data.error ?? null);
          setIsLoading(false);
        }
      } catch (e) {
        if (!cancelled && mountedRef.current) {
          setError((e as Error).message);
          setIsLoading(false);
        }
      }
    }

    fetchTrack();

    // Adaptive polling: check more often during active storms
    const interval = setInterval(fetchTrack, track ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [track]);

  return { track, isLoading, error };
}

/**
 * Check if a specific zone is under a wind signal.
 * Returns the signal level (0 = no signal, 1-5 = PAGASA TCWS).
 */
export function getSignalForZone(
  signals: TyphoonTrack["signals"],
  _zoneName: string
): number {
  // Simplified: return the highest signal level.
  // Full PSGC resolution would match zone names to signal areas.
  if (signals.length === 0) return 0;
  return Math.max(...signals.map((s) => s.signalLevel));
}
