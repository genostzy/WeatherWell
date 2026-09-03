"use client";

import { getDeviceId } from "./device-id";
import { MOCK_WATER_LEVEL_REPORTS } from "./mock-data";
import { createLocalStorageStore } from "./local-storage-store";
import type { DepthLevel } from "./depth";

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

const store = createLocalStorageStore<LiveWaterLevelReport[]>(
  "weatherwell.waterLevelReports",
  "weatherwell:water-level-reports-changed",
  SEED_REPORTS
);

/** Every live water-level report. Re-renders whenever one is added. */
export function useWaterLevelReports(): LiveWaterLevelReport[] {
  return store.useStore();
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
  store.update((reports) => [...reports, report]);
}

export function minutesSinceReport(reportedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(reportedAt).getTime()) / 60000));
}
