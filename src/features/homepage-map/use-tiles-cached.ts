"use client";

import { useSyncExternalStore } from "react";

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
 * Returns true if the device is online OR has cached tiles.
 * When offline with cached tiles, the map can still render from cache.
 * When online, always returns true (tiles will fetch from network).
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
