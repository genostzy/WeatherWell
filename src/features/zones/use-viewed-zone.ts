"use client";

import { useSearchParams } from "next/navigation";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { useZones } from "@/lib/reference-data/use-reference-data";
import type { Zone } from "@/lib/types";

/**
 * The barangay a resident is looking at for now, from `?zone=` on `/` and
 * `/evacuation`. Null when there is none, it is unknown, or it is my own
 * barangay, so "viewing" always means another one. Calls useSearchParams:
 * on a prerendered page, render it inside <Suspense>.
 */
export function useViewedZone(): Zone | null {
  const zoneId = useSearchParams().get("zone");
  const zones = useZones();
  const mine = useSelectedZone();
  if (!zoneId || zoneId === mine.id) return null;
  return zones.find((zone) => zone.id === zoneId) ?? null;
}
