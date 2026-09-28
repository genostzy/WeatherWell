"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { Zone } from "@/lib/types";

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

/** Half the width, in pixels, of the widest map drawn here (a desktop column): the culling box covers the screen. */
const VIEW_HALF_WIDTH_PX = 1000;

/**
 * How far from the middle of the view markers are drawn: about what the
 * screen shows at this zoom, so it shrinks as the map zooms in. It used to
 * grow with zoom (0.004° at zoom 10 to 0.25° at zoom 16); with the marker
 * cap keeping list order, that dropped the barangay in the middle of the
 * screen in dense towns — 5,898 barangays lost their own marker at street zoom.
 */
// ponytail: at most 1° (~110 km) when zoomed far out, where the 20-marker cap
// shows only the nearest anyway; the true bounds, if a wider view needs them.
export function viewportRadiusDeg(zoom: number): number {
  return Math.min(1, (VIEW_HALF_WIDTH_PX * 360) / (256 * 2 ** zoom));
}

export function viewportMarkerCap(zoom: number): number {
  return zoom <= 11 ? 20 : zoom <= 12 ? 60 : zoom <= 13 ? 150 : 500;
}

/**
 * The zones that get a marker: those in view, nearest the middle first, up
 * to the zoom's cap. `keepId` (the barangay the resident's screen is about)
 * keeps its marker whenever it is in view, even past the cap.
 */
export function zonesInView(zones: Zone[], centre: [number, number], zoom: number, keepId?: string): Zone[] {
  const radius = viewportRadiusDeg(zoom);
  // A degree of longitude is shorter than one of latitude away from the equator.
  const cosLat = Math.cos((centre[0] * Math.PI) / 180);
  const inView = zones
    .filter((z) => Math.abs(z.lat - centre[0]) < radius && Math.abs(z.lng - centre[1]) < radius)
    .map((z) => ({ z, d: (z.lat - centre[0]) ** 2 + ((z.lng - centre[1]) * cosLat) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .map(({ z }) => z);
  const shown = inView.slice(0, viewportMarkerCap(zoom));
  if (keepId && !shown.some((z) => z.id === keepId)) {
    const kept = inView.find((z) => z.id === keepId);
    if (kept) shown.push(kept);
  }
  return shown;
}
