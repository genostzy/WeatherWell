"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  return true;
}

/**
 * Hook to check the tile cache status (how many tiles are cached).
 * Returns the count and whether we're still loading.
 */
export function useTileCacheStatus(): { count: number; isLoading: boolean } {
  const [count, setCount] = useState(0);
  const swReady = typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;

  useEffect(() => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) return;

    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      setCount(event.data.count ?? 0);
    };

    sw.postMessage({ type: "tile-cache-status" }, [channel.port2]);
  }, []);

  return { count, isLoading: swReady && count === 0 };
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

/**
 * Returns true if tiles are available — either online or cached.
 * This replaces the Phase 1 navigator.onLine proxy with a more accurate
 * signal that considers the tile cache.
 */
export function useHasMapTiles(): boolean {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // If online, tiles are always available (will fetch from network)
  if (online) return true;

  // If offline, check if service worker has cached tiles
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) {
    return false;
  }

  // Use a synchronous check — the tile count is updated by the SW
  // and stored in a global for fast synchronous reads
  return (globalThis as Record<string, unknown>).__weatherwell_tile_count__ as number > 0;
}
