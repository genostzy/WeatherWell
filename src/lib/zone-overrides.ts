"use client";

import { useSyncExternalStore } from "react";
import { getActiveAlertForZone } from "./mock-data";
import type { Severity } from "./severity";
import type { AlertRecord, CenterStatus, LocalizedText } from "./types";

const OVERRIDES_KEY = "weatherwell.zoneOverrides";
const OVERRIDES_EVENT = "weatherwell:zone-overrides-changed";

/** "none" explicitly clears an active alert (admin marking the zone resolved); undefined means "no override, use the mock default". */
export type AlertOverrideValue = Severity | "none";

export interface ZoneOverride {
  alertSeverity?: AlertOverrideValue;
  centerStatus?: CenterStatus;
}

type OverridesMap = Record<string, ZoneOverride>;

const EMPTY_OVERRIDES: OverridesMap = {};

/**
 * This app has no backend — a barangay official "managing" their zone or an
 * admin overriding an alert (the PRD's existing Human Override anti-abuse
 * principle) both just mean writing here. localStorage keeps it real within
 * a session (survives reload) without pretending there's a server behind it,
 * the same tradeoff already made for onboarding/selected-zone state.
 */
function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(OVERRIDES_KEY);
  } catch {
    return null;
  }
}

// getSnapshot must return a referentially stable value when nothing changed
// (a React/useSyncExternalStore requirement) — cache the parsed object and
// only produce a new one when the underlying raw JSON actually differs.
let cachedRaw: string | null = null;
let cachedParsed: OverridesMap = EMPTY_OVERRIDES;

function getSnapshot(): OverridesMap {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedParsed = raw ? (JSON.parse(raw) as OverridesMap) : EMPTY_OVERRIDES;
    } catch {
      cachedParsed = EMPTY_OVERRIDES;
    }
  }
  return cachedParsed;
}

function getServerSnapshot(): OverridesMap {
  return EMPTY_OVERRIDES;
}

function writeAll(overrides: OverridesMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    // storage events only fire in OTHER tabs/windows, never the one that
    // wrote — dispatch our own so same-tab consumers re-render too.
    window.dispatchEvent(new Event(OVERRIDES_EVENT));
  } catch {
    // Private-mode or blocked storage: the edit just doesn't persist/broadcast.
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OVERRIDES_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(OVERRIDES_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * The full override map, live — re-renders whenever any zone's override
 * changes (same tab or another). Call once per component (Rules of Hooks —
 * never inside a zones.map() loop) and look entries up by zone id from the
 * returned object instead.
 */
export function useZoneOverrides(): OverridesMap {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setZoneAlertOverride(zoneId: string, alertSeverity: AlertOverrideValue | undefined): void {
  const all = { ...getSnapshot() };
  const next = { ...all[zoneId], alertSeverity };
  if (alertSeverity === undefined) delete next.alertSeverity;
  all[zoneId] = next;
  writeAll(all);
}

export function setZoneCenterStatusOverride(zoneId: string, centerStatus: CenterStatus | undefined): void {
  const all = { ...getSnapshot() };
  const next = { ...all[zoneId], centerStatus };
  if (centerStatus === undefined) delete next.centerStatus;
  all[zoneId] = next;
  writeAll(all);
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
