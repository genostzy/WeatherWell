"use client";

import { createContext, useContext } from "react";
import type { AlertRecord } from "./types";

export const AlertsContext = createContext<AlertRecord[] | null>(null);

/** Every alert the response carried, active and recently superseded alike. */
export function useAlerts(): AlertRecord[] {
  const alerts = useContext(AlertsContext);
  if (!alerts) {
    throw new Error("useAlerts requires an <AlertsProvider> ancestor. In tests, use renderWithData().");
  }
  return alerts;
}

/**
 * Replaces getActiveAlertForZone. The database enforces at most one active
 * alert per zone (partial unique index alerts_one_active_per_zone), so this
 * cannot silently pick between two.
 */
export function useActiveAlertForZone(zoneId: string): AlertRecord | undefined {
  return useAlerts().find((alert) => alert.zoneId === zoneId && alert.isActive);
}
