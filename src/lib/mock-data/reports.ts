import type { DepthLevel } from "../depth";

/** Daily crowd-report counts per zone for the last 7 days, oldest first — the "reports over time" trend the PRD's admin analytics dashboard calls for. */
const MOCK_REPORT_HISTORY: Record<string, number[]> = {
  "zone-1": [3, 5, 4, 8, 12, 18, 24],
  "zone-2": [6, 8, 11, 15, 22, 31, 44],
  "zone-3": [12, 15, 19, 26, 22, 17, 13],
  "zone-4": [1, 2, 1, 3, 2, 4, 3],
};

export function getReportHistoryForZone(zoneId: string): number[] {
  return MOCK_REPORT_HISTORY[zoneId] ?? [];
}

export function getReportsTodayForZone(zoneId: string): number {
  const history = getReportHistoryForZone(zoneId);
  return history[history.length - 1] ?? 0;
}

export interface AlertHistory {
  /** Alerts issued in the trailing 30 days. */
  issued: number;
  /** Of those, how many were later downgraded — the PRD's false-alarm-rate metric. */
  downgraded: number;
}

const MOCK_ALERT_HISTORY: Record<string, AlertHistory> = {
  "zone-1": { issued: 4, downgraded: 1 },
  "zone-2": { issued: 7, downgraded: 1 },
  "zone-3": { issued: 9, downgraded: 2 },
  "zone-4": { issued: 2, downgraded: 0 },
};

export function getAlertHistoryForZone(zoneId: string): AlertHistory {
  return MOCK_ALERT_HISTORY[zoneId] ?? { issued: 0, downgraded: 0 };
}

/** False-alarm rate as a percentage across all zones — PRD success metric, target ≤ 10%. */
export function getFalseAlarmRate(): number {
  const totals = Object.values(MOCK_ALERT_HISTORY).reduce(
    (sum, history) => ({
      issued: sum.issued + history.issued,
      downgraded: sum.downgraded + history.downgraded,
    }),
    { issued: 0, downgraded: 0 }
  );
  if (totals.issued === 0) return 0;
  return Math.round((totals.downgraded / totals.issued) * 100);
}

export interface WaterLevelReport {
  id: string;
  zoneId: string;
  depthLevel: DepthLevel;
  minutesAgo: number;
  /** Reputation weight from PRD Anti-Abuse layer 6 — 1.0 is an unproven device, higher is a device whose past reports matched real outcomes. */
  trustWeight: number;
  isOutlier: boolean;
}

/**
 * Recent individual crowd reports, newest first. Phase 1 shows these as a
 * read-only "what your neighbours are reporting" list; Phase 3's threshold
 * engine is what actually turns them into alerts.
 */
export const MOCK_WATER_LEVEL_REPORTS: WaterLevelReport[] = [
  { id: "report-1", zoneId: "zone-1", depthLevel: "knee", minutesAgo: 8, trustWeight: 1.4, isOutlier: false },
  { id: "report-2", zoneId: "zone-1", depthLevel: "knee", minutesAgo: 21, trustWeight: 1.0, isOutlier: false },
  { id: "report-3", zoneId: "zone-1", depthLevel: "ankle", minutesAgo: 47, trustWeight: 1.2, isOutlier: false },
  { id: "report-4", zoneId: "zone-1", depthLevel: "neck", minutesAgo: 52, trustWeight: 0.4, isOutlier: true },
  { id: "report-5", zoneId: "zone-2", depthLevel: "waist", minutesAgo: 5, trustWeight: 1.6, isOutlier: false },
  { id: "report-6", zoneId: "zone-2", depthLevel: "waist", minutesAgo: 14, trustWeight: 1.1, isOutlier: false },
  { id: "report-7", zoneId: "zone-2", depthLevel: "knee", minutesAgo: 38, trustWeight: 1.0, isOutlier: false },
  { id: "report-8", zoneId: "zone-3", depthLevel: "neck", minutesAgo: 11, trustWeight: 1.8, isOutlier: false },
  { id: "report-9", zoneId: "zone-3", depthLevel: "waist", minutesAgo: 33, trustWeight: 1.3, isOutlier: false },
  { id: "report-10", zoneId: "zone-4", depthLevel: "dry", minutesAgo: 26, trustWeight: 1.0, isOutlier: false },
  { id: "report-11", zoneId: "zone-4", depthLevel: "ankle", minutesAgo: 63, trustWeight: 1.1, isOutlier: false },
];

/** PRD Anti-Abuse layer 3: no single report triggers an alert — several agreeing ones must arrive first. */
export const REPORT_THRESHOLD = 3;
