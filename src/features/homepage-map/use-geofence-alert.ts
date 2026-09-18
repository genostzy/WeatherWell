"use client";

import { useEffect, useRef, useState } from "react";
import { useAlerts } from "@/lib/alerts-store";
import { getZoneStatus } from "@/lib/zone-status";
import type { Zone } from "@/lib/types";

interface GeofenceAlert {
  zoneName: string;
  severity: string;
  message: string;
}

/**
 * Monitors the user's live GPS position and detects when they enter
 * a zone with a dangerous or hazardous alert. Returns the current
 * geofence alert (if any) and a dismiss function.
 *
 * Only triggers for "dangerous" and "hazardous" zones — advisory/watch
 * zones don't warrant a proactive interruption.
 *
 * The alert fires once per zone entry and resets when the user leaves
 * the zone or dismisses it.
 */
export function useGeofenceAlert(
  zones: Zone[],
  position: { lat: number; lng: number } | null
): { alert: GeofenceAlert | null; dismiss: () => void } {
  const alerts = useAlerts();
  const [alert, setAlert] = useState<GeofenceAlert | null>(null);
  const lastZoneRef = useRef<string | null>(null);

  useEffect(() => {
    if (!position) return;

    // Find the nearest zone within ~2km
    let nearestZone: Zone | null = null;
    let nearestDist = Infinity;

    for (const zone of zones) {
      const dist = haversineDistance(position.lat, position.lng, zone.lat, zone.lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestZone = zone;
      }
    }

    if (!nearestZone || nearestDist > 2000) {
      // User is more than 2km from any zone center — clear alert
      lastZoneRef.current = null;
      return;
    }

    const zoneAlert = alerts.find((a) => a.zoneId === nearestZone!.id && a.isActive);
    const status = getZoneStatus(zoneAlert);

    if (
      (status === "dangerous" || status === "hazardous") &&
      lastZoneRef.current !== nearestZone.id
    ) {
      lastZoneRef.current = nearestZone.id;
      setAlert({
        zoneName: nearestZone.name,
        severity: status,
        message: zoneAlert
          ? `You are near ${nearestZone.name}. ${status === "hazardous" ? "Evacuate now!" : "Move to higher ground."}`
          : `You are near ${nearestZone.name}. Check conditions.`,
      });
    } else if (status === "safe" && lastZoneRef.current === nearestZone.id) {
      // Left the dangerous zone
      lastZoneRef.current = null;
      setAlert(null);
    }
  }, [position, zones, alerts]);

  const dismiss = () => setAlert(null);

  return { alert, dismiss };
}

/** Haversine distance in meters between two lat/lng points. */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
