"use client";

import { useEffect, useState } from "react";

/**
 * Low-frequency/low-accuracy watch per PRD Non-Functional Requirements
 * (limits battery drain). Returns null on denial, unavailability, or
 * before the first fix arrives — every call site must handle null by
 * falling back to the existing static pre-authored route text, never a
 * loading spinner blocking the rest of the page.
 */
export function useLivePosition(): { lat: number; lng: number } | null {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPosition(null),
      { enableHighAccuracy: false, maximumAge: 30000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return position;
}
