"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

/**
 * Tracks the current map zoom level and viewport center with throttling.
 * Fires at most once every 200ms to avoid re-render storms during panning.
 *
 * Shared by both map canvases (resident and admin): each feeds the zoom and
 * center back to its own viewport-culling `visibleZones` list, so a map
 * only ever renders markers for zones near what's actually on screen,
 * regardless of how many zones the reference data holds nationwide.
 */
export function ViewportTracker({
  onZoom,
  onCenter,
}: {
  onZoom: (z: number) => void;
  onCenter: (c: [number, number]) => void;
}) {
  const map = useMap();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const update = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onZoom(map.getZoom());
        const c = map.getCenter();
        onCenter([c.lat, c.lng]);
      }, 200);
    };
    onZoom(map.getZoom());
    const c = map.getCenter();
    onCenter([c.lat, c.lng]);
    map.on("zoomend moveend", update);
    return () => {
      map.off("zoomend moveend", update);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [map, onZoom, onCenter]);
  return null;
}

/**
 * The zoom-adaptive culling radius and marker cap shared by both canvases:
 * 0.02° (~2 km) at zoom 10 → 0.25° (~25 km) at zoom 15+, capped at 20
 * markers at zoom ≤11 rising to 500 at zoom ≥14. Centred on the actual
 * viewport (not a fixed point), so markers follow panning and never vanish
 * just because the map moved.
 */
export function viewportRadiusDeg(zoom: number): number {
  return Math.min(0.25, 0.004 * Math.pow(2, Math.max(zoom - 10, 0)));
}

export function viewportMarkerCap(zoom: number): number {
  return zoom <= 11 ? 20 : zoom <= 12 ? 60 : zoom <= 13 ? 150 : 500;
}
