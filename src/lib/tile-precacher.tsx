"use client";

import { useEffect, useRef } from "react";
import { getSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { useZones } from "@/lib/reference-data/use-reference-data";

/**
 * How long to wait before starting the background tile download. The live
 * map's own initial tiles (~20-30 for one visible viewport) and this
 * precache job (~28 tiles, zoom 12-15 within 2 km) both go through the same service worker to the
 * same handful of *.tile.openstreetmap.org hosts, so they compete for the
 * same small pool of concurrent connections — starting the precache job
 * immediately on mount let it win that race against the live map often
 * enough to read as "the map sometimes just doesn't load", worse on desktop
 * where the larger viewport needs more initial tiles to fill it. This delay
 * is deliberately generous: long enough that the live map's own tiles have
 * finished even on a slow connection, not just a fast one.
 */
const PRECACHE_DELAY_MS = 4000;

/**
 * Triggers tile pre-caching for the user's selected zone after onboarding.
 * Runs once on mount — downloads ~28 tiles (~0.5 MB: zoom 12-15, 2 km around the zone) in the background, after
 * PRECACHE_DELAY_MS so it doesn't compete with the live map's own tiles.
 * The service worker caches them for offline use.
 */
export function TilePrecacher() {
  const zones = useZones();
  const hasPrecached = useRef(false);

  useEffect(() => {
    if (hasPrecached.current) return;
    if (!navigator.serviceWorker?.controller) return;

    const zoneId = getSelectedZoneId();
    if (!zoneId || zones.length === 0) return;

    const zone = zones.find((z) => z.id === zoneId);
    if (!zone?.lat || !zone?.lng) return;

    // Set before scheduling, not inside the timeout: a re-render that
    // changes `zones` before the timer fires must not schedule a second one.
    hasPrecached.current = true;

    const timer = setTimeout(() => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) return; // could have gone away in the delay window

      // Pre-cache tiles in the background — don't block the UI
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        const { total, cached } = event.data;
        if (cached > 0) {
          console.log(`[WeatherWell] Pre-cached ${cached}/${total} tiles for ${zone.name}`);
        }
      };

      controller.postMessage(
        { type: "precache-tiles", lat: zone.lat, lng: zone.lng, radiusKm: 2 },
        [channel.port2]
      );
    }, PRECACHE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [zones]);

  return null;
}
