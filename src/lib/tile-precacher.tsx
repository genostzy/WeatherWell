"use client";

import { useEffect, useRef } from "react";
import { getSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { useZones } from "@/lib/reference-data/use-reference-data";

/**
 * Triggers tile pre-caching for the user's selected zone after onboarding.
 * Runs once on mount — downloads ~500 tiles (~10MB) in the background.
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

    hasPrecached.current = true;

    // Pre-cache tiles in the background — don't block the UI
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const { total, cached } = event.data;
      if (cached > 0) {
        console.log(`[WeatherWell] Pre-cached ${cached}/${total} tiles for ${zone.name}`);
      }
    };

    navigator.serviceWorker.controller.postMessage(
      { type: "precache-tiles", lat: zone.lat, lng: zone.lng, radiusKm: 2 },
      [channel.port2]
    );
  }, [zones]);

  return null;
}
