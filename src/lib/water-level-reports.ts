"use client";

import { useSyncExternalStore } from "react";
import { getDeviceId } from "./device-id";
import { MOCK_WATER_LEVEL_REPORTS } from "./mock-data";
import type { DepthLevel } from "./depth";

const REPORTS_KEY = "weatherwell.waterLevelReports";
const REPORTS_EVENT = "weatherwell:water-level-reports-changed";

export interface LiveWaterLevelReport {
  id: string;
  zoneId: string;
  depthLevel: DepthLevel;
  /** Absolute timestamp rather than a static "minutes ago" — see minutesSinceReport. */
  reportedAt: string;
  /** PRD Anti-Abuse layer 6: 1.0 is an unproven device, higher is one with a track record. */
  trustWeight: number;
  isOutlier: boolean;
  deviceId: string;
}

/**
 * The report form previously only flipped local state to show a thank-you
 * screen — a submitted report never appeared in "what neighbours are
 * reporting" on the very same page, unlike community pins which already had
 * real (local) persistence. Computed once at module load, not per read, so
 * useSyncExternalStore's snapshot stays stable — the same fix already
 * applied to community-pins.ts's seed data.
 */
const SEED_REPORTS: LiveWaterLevelReport[] = MOCK_WATER_LEVEL_REPORTS.map((report) => ({
  id: report.id,
  zoneId: report.zoneId,
  depthLevel: report.depthLevel,
  reportedAt: new Date(Date.now() - report.minutesAgo * 60 * 1000).toISOString(),
  trustWeight: report.trustWeight,
  isOutlier: report.isOutlier,
  deviceId: "seed-device",
}));

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REPORTS_KEY);
  } catch {
    return null;
  }
}

// getSnapshot must return a referentially stable value when nothing changed
// (a React/useSyncExternalStore requirement) — same cache-by-raw-JSON
// approach as zone-overrides.ts and community-pins.ts.
let cachedRaw: string | null | undefined = undefined;
let cachedParsed: LiveWaterLevelReport[] = SEED_REPORTS;

function getSnapshot(): LiveWaterLevelReport[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    if (raw === null) {
      cachedParsed = SEED_REPORTS;
    } else {
      try {
        cachedParsed = JSON.parse(raw) as LiveWaterLevelReport[];
      } catch {
        cachedParsed = SEED_REPORTS;
      }
    }
  }
  return cachedParsed;
}

function getServerSnapshot(): LiveWaterLevelReport[] {
  return SEED_REPORTS;
}

function writeReports(reports: LiveWaterLevelReport[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
    // storage events only fire in OTHER tabs — dispatch our own so same-tab
    // consumers (the panel on the same page you just submitted from) update too.
    window.dispatchEvent(new Event(REPORTS_EVENT));
  } catch {
    // Private-mode or blocked storage: the report just doesn't persist/broadcast.
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(REPORTS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(REPORTS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Every live water-level report. Re-renders whenever one is added. */
export function useWaterLevelReports(): LiveWaterLevelReport[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Newest first, matching the previous mock-data helper's ordering contract. */
export function getRecentReportsForZoneLive(
  reports: LiveWaterLevelReport[],
  zoneId: string
): LiveWaterLevelReport[] {
  return reports
    .filter((report) => report.zoneId === zoneId)
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
}

/** A fresh, unproven-device report — reputation scoring and outlier detection are Final Phase, so every real submission starts here. */
export function addWaterLevelReport(zoneId: string, depthLevel: DepthLevel): void {
  const report: LiveWaterLevelReport = {
    id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    zoneId,
    depthLevel,
    reportedAt: new Date().toISOString(),
    trustWeight: 1.0,
    isOutlier: false,
    deviceId: getDeviceId(),
  };
  writeReports([...getSnapshot(), report]);
}

export function minutesSinceReport(reportedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(reportedAt).getTime()) / 60000));
}
