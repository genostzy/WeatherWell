"use client";

import { useEffect, useState } from "react";

interface TileCacheStatus {
  count: number;
  isLoading: boolean;
}

/**
 * Hook to check the tile cache status (how many tiles are cached).
 * Returns the count and whether we're still loading.
 */
export function useTileCacheStatus(): TileCacheStatus {
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) {
      setIsLoading(false);
      return;
    }

    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      setCount(event.data.count ?? 0);
      setIsLoading(false);
    };

    sw.postMessage({ type: "tile-cache-status" }, [channel.port2]);
  }, []);

  return { count, isLoading };
}

/**
 * Request the service worker to pre-cache tiles for a zone.
 * Returns the number of tiles cached.
 */
export async function preCacheTilesForZone(
  lat: number,
  lng: number,
  radiusKm = 2
): Promise<{ total: number; cached: number }> {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) return { total: 0, cached: 0 };

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    sw.postMessage(
      { type: "precache-tiles", lat, lng, radiusKm },
      [channel.port2]
    );

    // Timeout after 30 seconds
    setTimeout(() => resolve({ total: 0, cached: 0 }), 30_000);
  });
}
