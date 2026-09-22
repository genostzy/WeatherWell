"use client";

import { useEffect, useState } from "react";
import type { HistoricalEvent } from "./types";

/**
 * The historical-events overlay layer's data, for whichever zones are
 * currently visible. Deliberately NOT part of ReferenceDataProvider's gated
 * fetch: this is a supplementary, opt-in layer (off by default on both
 * maps), not something every visitor needs before the app can render — the
 * whole point of that gate existing is the safety-critical zones/alerts
 * data, and this session's earlier fix went the other direction (getting
 * onboarding OFF that gate) for exactly this reason.
 *
 * No on/off flag here — the caller only mounts HistoricalEventsLayer (the
 * component that calls this) when its own layer checkbox is on, the same
 * way HazardBackdropLayer/PoiMarkerLayer/etc. are already conditionally
 * mounted on both maps. Unmounting is what stops the fetch and clears the
 * markers; a flag here would just be a second way to say the same thing.
 */
export function useHistoricalEvents(zoneIds: string[]): HistoricalEvent[] {
  const [events, setEvents] = useState<HistoricalEvent[]>([]);
  const key = zoneIds.join(",");

  useEffect(() => {
    if (!key) return;

    let active = true;
    fetch(`/api/historical-events?zoneIds=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((body: { events: HistoricalEvent[] }) => {
        if (active) setEvents(body.events ?? []);
      })
      .catch(() => {
        if (active) setEvents([]);
      });

    return () => {
      active = false;
    };
  }, [key]);

  return events;
}
