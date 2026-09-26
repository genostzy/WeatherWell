import type { HazardLevel } from "./hazards";

/** PAGASA's own "heavy" rainfall classification starts around 15mm in an hour. */
export function isHeavyRainfall(mmPerHour: number): boolean {
  return mmPerHour >= 15;
}

export type HeatIndexCategory = "caution" | "extreme_caution" | "danger" | "extreme_danger";

/** PAGASA's own published heat index bands (apparent temperature, °C). */
export function getHeatIndexCategory(celsius: number): HeatIndexCategory {
  if (celsius >= 52) return "extreme_danger";
  if (celsius >= 42) return "danger";
  if (celsius >= 33) return "extreme_caution";
  return "caution";
}

/**
 * Medium/High landslide susceptibility plus currently-heavy rainfall. Unknown
 * susceptibility is never elevated (I3): a caution built on missing data is a
 * false alarm.
 */
export function hasElevatedLandslideRisk(susceptibility: HazardLevel, mmPerHour: number): boolean {
  return (susceptibility === "medium" || susceptibility === "high") && isHeavyRainfall(mmPerHour);
}

/** Agreeing reports needed before the alert engine raises an advisory (see check_and_trigger_alerts). */
export const REPORT_THRESHOLD = 3;

/** Combined trust those reports need, each reporter's best report counted once (see report_trust_weights). */
export const MIN_REPORT_TRUST = 1.0;

/**
 * A barangay's bar for an automatic advisory at a calibration step (Stage 4):
 * step 0 is the two floors above, the anti-abuse minimum; each step up adds a
 * reporter, to at most 5, and 0.25 trust. Mirrors check_and_trigger_alerts.
 */
export function alertBar(step: number): { reporters: number; trust: number } {
  return { reporters: Math.min(REPORT_THRESHOLD + step, 5), trust: MIN_REPORT_TRUST + 0.25 * step };
}

/** The alert engine only counts reports from the last 6 hours (check_and_trigger_alerts' v_window). */
export const REPORT_WINDOW_HOURS = 6;

/**
 * True when a report still counts toward an automatic advisory, as the engine
 * counts it: recent, not dry, not an outlier, and from a device that still
 * counts (weight above 0).
 */
export function countsTowardAlert(
  report: { reportedAt: string; isOutlier: boolean; depthLevel: string; trustWeight: number },
  now: number = Date.now()
): boolean {
  return (
    report.depthLevel !== "dry" &&
    !report.isOutlier &&
    report.trustWeight > 0 &&
    now - Date.parse(report.reportedAt) <= REPORT_WINDOW_HOURS * 3_600_000
  );
}
