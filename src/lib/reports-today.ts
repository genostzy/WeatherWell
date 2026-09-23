import type { LiveWaterLevelReport } from "./water-level-reports";

/**
 * Reports filed since the device's local midnight in the given zones.
 * ponytail: counts only what /api/reports returned (its newest 200 rows), so
 * a very busy day undercounts; add a server-side count if that ever matters.
 */
export function countReportsToday(
  reports: LiveWaterLevelReport[],
  zoneIds: Set<string>,
  now: Date = new Date()
): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return reports.filter((r) => zoneIds.has(r.zoneId) && Date.parse(r.reportedAt) >= midnight).length;
}
