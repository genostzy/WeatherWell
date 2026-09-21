"use client";

import { useCallback, useEffect, useState } from "react";
import type { LocalizedText } from "./types";
import type { ActionResult } from "@/app/actions/action-result";

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
  /** ISO 8601, from the database's placed_at (a real timestamptz), not a client clock. */
  placedAt: string;
}

/**
 * Persisted official markers — the map's admin-only hazard-note layer.
 * Fetches from /api/official-markers on mount (and again after a write this
 * hook itself makes) and writes through the Server Actions in
 * app/actions/official-markers.ts, which run RLS-checked as the signed-in
 * official (see that file's own doc comment for why this bypasses the
 * offline outbox: an official writes from a desk with a connection, not a
 * resident's phone that may lose one).
 *
 * Every AdminMapCanvas instance calls this hook independently and refetches
 * after its own write, so a marker one official places appears to a
 * different official only on their next mount or write — there is no
 * realtime push here. Acceptable for now (this is a working-notes layer,
 * not a life-safety alert, which the alerts table's realtime hook has to
 * be reserved for): tracked as a known follow-up alongside per-zone
 * scoping in the table's own migration comment.
 */
export function useOfficialMarkers() {
  const [markers, setMarkers] = useState<OfficialMarker[]>([]);

  // No setState call happens synchronously in the effect body below —
  // fetch() itself is the effect's one side effect, and every setMarkers
  // call is inside a .then()/.catch(), same shape as community-pins.ts's
  // useServerPins — so the mount call and the addMarker/removeMarker
  // refetch call below can safely share this one implementation.
  const refresh = useCallback(() => {
    let cancelled = false;
    fetch("/api/official-markers")
      .then((response) =>
        response.ok
          ? (response.json() as Promise<OfficialMarker[]>)
          : Promise.reject(new Error(`/api/official-markers responded ${response.status}`))
      )
      .then((data) => {
        if (!cancelled) setMarkers(data);
      })
      .catch(() => {
        // Offline, timed out, or refused (e.g. not (yet) an appointed
        // official) — degrade, don't crash the map. Whatever markers this
        // hook already had stay on screen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refresh(), [refresh]);

  const addMarker = useCallback(
    async (
      lat: number,
      lng: number,
      type: OfficialMarkerType,
      caption: string
    ): Promise<ActionResult> => {
      const { createOfficialMarker } = await import("@/app/actions/official-markers");
      const result = await createOfficialMarker({ lat, lng, type, caption });
      if (result.ok) refresh();
      return result;
    },
    [refresh]
  );

  const removeMarker = useCallback(
    async (id: string): Promise<ActionResult> => {
      const { deleteOfficialMarker } = await import("@/app/actions/official-markers");
      const result = await deleteOfficialMarker(id);
      if (result.ok) refresh();
      return result;
    },
    [refresh]
  );

  return { markers, addMarker, removeMarker };
}
