"use client";

import { createContext, useCallback, useContext } from "react";
import type { AlertRecord } from "./types";
import type { SetZoneAlertInput, SetZoneAlertsResult } from "@/app/actions/set-zone-alert";
import type { Severity } from "./severity";
import type { ActionResult } from "@/app/actions/action-result";

export const AlertsContext = createContext<AlertRecord[] | null>(null);

/**
 * Re-reads /api/alerts into AlertsContext. Supplied by ReferenceDataProvider
 * beside the alerts themselves, because that provider is the one place the
 * alert list lives — a screen that patched its own copy would leave every
 * other screen showing the old alert.
 */
export const AlertsRefreshContext = createContext<(() => Promise<void>) | null>(null);

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

/**
 * The one way a screen sets a zone's alert (C1).
 *
 * The alert list is fetched once when the app opens. Before this existed each
 * screen called the Server Action itself and did nothing on success, so the
 * write landed in the database while every alert control kept showing the
 * old state — and because a controlled select already showing "Clear" fires
 * no change when Clear is picked, an official could not withdraw an alert
 * they had just issued in error. Refreshing here, after the database has
 * confirmed the write, means every screen reading AlertsContext follows.
 *
 * Refetched rather than patched locally: the database decides what the new
 * row looks like (superseded_severity, generated copy), and a hand-built
 * record would be a guess at that. The service worker sends /api/alerts
 * network-first, so this reaches the database whenever a network exists.
 *
 * The dynamic import is for the same reason every caller used one before:
 * set-zone-alert.ts is a "use server" module that transitively imports
 * "server-only", and must not be evaluated in a client test's module graph.
 */
export function useSetZoneAlert(): (input: SetZoneAlertInput) => Promise<ActionResult> {
  const refresh = useContext(AlertsRefreshContext);
  const setAlert = useCallback(
    async (input: SetZoneAlertInput) => {
      const { setZoneAlert } = await import("@/app/actions/set-zone-alert");
      const result = await setZoneAlert(input);
      if (result.ok) await refresh?.();
      return result;
    },
    [refresh]
  );
  if (!refresh) {
    // A silent no-op here is exactly the C1 defect coming back.
    throw new Error("useSetZoneAlert requires ReferenceDataProvider's alerts refresh. In tests, use renderWithData().");
  }
  return setAlert;
}

/** Alerts several barangays in one call; refreshes alerts once afterwards. */
export function useSetZoneAlerts(): (input: { zoneIds: string[]; severity: Severity }) => Promise<SetZoneAlertsResult> {
  const refresh = useContext(AlertsRefreshContext);
  const setAlerts = useCallback(
    async (input: { zoneIds: string[]; severity: Severity }) => {
      const { setZoneAlerts } = await import("@/app/actions/set-zone-alert");
      const result = await setZoneAlerts(input);
      if (result.sent > 0) await refresh?.();
      return result;
    },
    [refresh]
  );
  if (!refresh) {
    throw new Error("useSetZoneAlerts requires ReferenceDataProvider's alerts refresh. In tests, use renderWithData().");
  }
  return setAlerts;
}

/** Confirms the zone's automatic advisory as the official's own; refreshes alerts once the database accepts it. */
export function useConfirmAutomaticAlert(): (zoneId: string) => Promise<ActionResult> {
  const refresh = useContext(AlertsRefreshContext);
  const confirm = useCallback(
    async (zoneId: string) => {
      const { confirmAutomaticAlert } = await import("@/app/actions/set-zone-alert");
      const result = await confirmAutomaticAlert(zoneId);
      if (result.ok) await refresh?.();
      return result;
    },
    [refresh]
  );
  if (!refresh) {
    throw new Error("useConfirmAutomaticAlert requires ReferenceDataProvider's alerts refresh. In tests, use renderWithData().");
  }
  return confirm;
}
