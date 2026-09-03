"use client";

import { getActiveAlertForZone } from "./mock-data";
import { createLocalStorageStore } from "./local-storage-store";
import { PAGASA_RAINFALL_WARNING_LABEL, SEVERITY_ACTION_STEP, type Severity } from "./severity";
import type { AlertRecord, CenterStatus, LocalizedText } from "./types";

/** "none" explicitly clears an active alert (admin marking the zone resolved); undefined means "no override, use the mock default". */
export type AlertOverrideValue = Severity | "none";

export interface ZoneOverride {
  alertSeverity?: AlertOverrideValue;
  centerStatus?: CenterStatus;
  /** Live headcount at the zone's evacuation center (PRD Gap B). When set, this — not centerStatus — drives the displayed status; see deriveCenterStatusFromOccupancy. */
  currentOccupancy?: number;
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

/** Admin-entered headcount at a zone's evacuation center — undefined clears it, falling back to the manual centerStatus enum (PRD Gap B). */
export function setZoneOccupancyOverride(zoneId: string, currentOccupancy: number | undefined): void {
  store.update((all) => {
    const next = { ...all[zoneId], currentOccupancy };
    if (currentOccupancy === undefined) delete next.currentOccupancy;
    return { ...all, [zoneId]: next };
  });
}

/**
 * The fallback alert message when an admin sets an override severity for a
 * zone with no pre-existing mock alert to reuse. Includes the same action
 * step and PAGASA rainfall-warning reference every real mock alert message
 * carries, so an override-only alert doesn't read as less informative than
 * one that started from crowd reports (PRD Climate Resilience plan, Gap E).
 */
function genericOverrideMessage(severity: Severity): LocalizedText {
  const pagasaLabel = PAGASA_RAINFALL_WARNING_LABEL[severity];
  const actionStep = SEVERITY_ACTION_STEP[severity];
  return {
    en: `Alert severity set by zone management. ${actionStep.en}${
      pagasaLabel ? ` (${pagasaLabel.en}.)` : ""
    }`,
    fil: `Severity ng alert na itinakda ng namamahala sa zone. ${actionStep.fil}${
      pagasaLabel ? ` (${pagasaLabel.fil}.)` : ""
    }`,
  };
}

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
    message: base?.message ?? genericOverrideMessage(override),
    source: "manual",
    confidence: base?.confidence ?? "validated",
    predictedTiming: base?.predictedTiming,
    issuedAt: base?.issuedAt ?? new Date().toISOString(),
    isActive: true,
  };
}

/** Full-capacity threshold before "limited"/"full" band boundaries, per PRD Gap B. Kept low ("limited" well before literally full) since a shelter approaching capacity needs advance notice, not a last-minute one. */
const LIMITED_AT_RATIO = 0.7;
const FULL_AT_RATIO = 0.95;

/** Derives a plain-language status from a real headcount instead of requiring a separate manual choice — PRD Gap B (evacuation center capacity management). */
export function deriveCenterStatusFromOccupancy(capacity: number, occupancy: number): CenterStatus {
  if (capacity <= 0) return "full";
  const ratio = occupancy / capacity;
  if (ratio >= FULL_AT_RATIO) return "full";
  if (ratio >= LIMITED_AT_RATIO) return "limited";
  return "space_available";
}

/**
 * The capacity status the rest of the app should display. If a live
 * headcount is being tracked (capacity + occupancy both known), that
 * derives the status directly — otherwise falls back to the manual
 * centerStatus override, then the zone's own mock default.
 */
export function resolveEffectiveCenterStatus(
  zoneDefault: CenterStatus,
  override: CenterStatus | undefined,
  capacity?: number,
  occupancy?: number
): CenterStatus {
  if (capacity !== undefined && occupancy !== undefined) {
    return deriveCenterStatusFromOccupancy(capacity, occupancy);
  }
  return override ?? zoneDefault;
}
