"use client";

import { getActiveAlertForZone } from "./mock-data";
import { createLocalStorageStore } from "./local-storage-store";
import type { Severity } from "./severity";
import type { AlertRecord, CenterStatus, LocalizedText } from "./types";

/** "none" explicitly clears an active alert (admin marking the zone resolved); undefined means "no override, use the mock default". */
export type AlertOverrideValue = Severity | "none";

export interface ZoneOverride {
  alertSeverity?: AlertOverrideValue;
  centerStatus?: CenterStatus;
}

type OverridesMap = Record<string, ZoneOverride>;

const EMPTY_OVERRIDES: OverridesMap = {};

const store = createLocalStorageStore<OverridesMap>(
  "weatherwell.zoneOverrides",
  "weatherwell:zone-overrides-changed",
  EMPTY_OVERRIDES
);

/**
 * The full override map, live — re-renders whenever any zone's override
 * changes (same tab or another). Call once per component (Rules of Hooks —
 * never inside a zones.map() loop) and look entries up by zone id from the
 * returned object instead.
 */
export function useZoneOverrides(): OverridesMap {
  return store.useStore();
}

export function setZoneAlertOverride(zoneId: string, alertSeverity: AlertOverrideValue | undefined): void {
  store.update((all) => {
    const next = { ...all[zoneId], alertSeverity };
    if (alertSeverity === undefined) delete next.alertSeverity;
    return { ...all, [zoneId]: next };
  });
}

export function setZoneCenterStatusOverride(zoneId: string, centerStatus: CenterStatus | undefined): void {
  store.update((all) => {
    const next = { ...all[zoneId], centerStatus };
    if (centerStatus === undefined) delete next.centerStatus;
    return { ...all, [zoneId]: next };
  });
}

const GENERIC_OVERRIDE_MESSAGE: LocalizedText = {
  en: "Alert severity set by zone management.",
  fil: "Severity ng alert na itinakda ng namamahala sa zone.",
};

/**
 * The alert the rest of the app should actually display for a zone: the
 * admin/zone override if one is set, otherwise the mock data's own alert.
 * `override` comes from a single useZoneOverrides() call higher up — never
 * call the hook here, so this stays a plain function usable inside loops.
 */
export function resolveEffectiveAlert(
  zoneId: string,
  override: AlertOverrideValue | undefined
): AlertRecord | undefined {
  if (override === "none") return undefined;
  const base = getActiveAlertForZone(zoneId);
  if (!override) return base;
  return {
    id: base?.id ?? `override-${zoneId}`,
    zoneId,
    severity: override,
    message: base?.message ?? GENERIC_OVERRIDE_MESSAGE,
    source: "manual",
    confidence: base?.confidence ?? "validated",
    predictedTiming: base?.predictedTiming,
    issuedAt: base?.issuedAt ?? new Date().toISOString(),
    isActive: true,
  };
}

/** The capacity status the rest of the app should display: the override if set, otherwise the zone's own mock default. */
export function resolveEffectiveCenterStatus(
  zoneDefault: CenterStatus,
  override: CenterStatus | undefined
): CenterStatus {
  return override ?? zoneDefault;
}
