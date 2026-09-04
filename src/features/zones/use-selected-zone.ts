"use client";

import { useSyncExternalStore } from "react";
import { getSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { MOCK_ZONES } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

/**
 * Shown when the user has not picked a zone yet, or when localStorage is
 * blocked. The onboarding gate normally prevents reaching a page in that
 * state, but every consumer still needs a Zone to render.
 */
const DEFAULT_ZONE: Zone = MOCK_ZONES[0];

/** Resolves a stored zone id against the known zones, falling back to the default. */
function resolveZone(zoneId: string | null): Zone {
  return MOCK_ZONES.find((zone) => zone.id === zoneId) ?? DEFAULT_ZONE;
}

/**
 * The stored id only changes during onboarding, which navigates away
 * afterwards, so there is nothing to subscribe to — the value is read once
 * per mount.
 */
function subscribe(): () => void {
  return () => {};
}

/** Server render can't see localStorage; SSR falls back to the default zone. */
function getServerSnapshot(): string | null {
  return null;
}

/**
 * Reads the zone the user chose during onboarding. Uses useSyncExternalStore
 * rather than an effect so there is no setState-in-effect and no hydration
 * mismatch — the server snapshot is the default zone, and React re-renders
 * with the stored one after hydration.
 */
export function useSelectedZone(): Zone {
  const zoneId = useSyncExternalStore(subscribe, getSelectedZoneId, getServerSnapshot);
  return resolveZone(zoneId);
}
