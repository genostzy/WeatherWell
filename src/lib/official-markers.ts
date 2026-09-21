"use client";

import { useState, useCallback } from "react";
import type { LocalizedText } from "./types";

export type OfficialMarkerType = "flood" | "road_damage" | "blocked" | "power_outage" | "water_issue" | "landslide" | "other";

export const OFFICIAL_MARKER_LABEL: Record<OfficialMarkerType, LocalizedText> = {
  flood: { en: "Flooded area", fil: "Baha area" },
  road_damage: { en: "Road damage", fil: "Sira ang kalsada" },
  blocked: { en: "Blocked passage", fil: "Sarado ang daan" },
  power_outage: { en: "Power outage", fil: "Brownout" },
  water_issue: { en: "Water supply issue", fil: "Problema sa tubig" },
  landslide: { en: "Landslide", fil: "Landslide" },
  other: { en: "Other hazard", fil: "Iba pang hazard" },
};

export const OFFICIAL_MARKER_COLOR: Record<OfficialMarkerType, string> = {
  flood: "#2563eb",
  road_damage: "#d97706",
  blocked: "#dc2626",
  power_outage: "#7c3aed",
  water_issue: "#0891b2",
  landslide: "#92400e",
  other: "#6b7280",
};

export const OFFICIAL_MARKER_TYPES: OfficialMarkerType[] = [
  "flood",
  "road_damage",
  "blocked",
  "power_outage",
  "water_issue",
  "landslide",
  "other",
];

export interface OfficialMarker {
  id: string;
  lat: number;
  lng: number;
  type: OfficialMarkerType;
  caption: string;
  placedBy: string;
  placedAt: number;
}

let nextId = 1;

export function createOfficialMarker(
  lat: number,
  lng: number,
  type: OfficialMarkerType,
  caption: string,
  placedBy: string,
): OfficialMarker {
  return {
    id: `official-${nextId++}`,
    lat,
    lng,
    type,
    caption,
    placedBy,
    placedAt: Date.now(),
  };
}

/**
 * Simple hook for managing official markers in memory.
 * Returns the current list and helpers to add/remove.
 * Can be swapped for a database-backed store later.
 */
export function useOfficialMarkers() {
  const [markers, setMarkers] = useState<OfficialMarker[]>([]);

  const addMarker = useCallback(
    (lat: number, lng: number, type: OfficialMarkerType, caption: string, placedBy: string) => {
      const marker = createOfficialMarker(lat, lng, type, caption, placedBy);
      setMarkers((prev) => [...prev, marker]);
      return marker;
    },
    [],
  );

  const removeMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { markers, addMarker, removeMarker };
}
