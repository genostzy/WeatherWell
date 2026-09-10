import { SEVERITY_ORDER, type Severity } from "./severity";
import type { AlertRecord } from "./types";

/**
 * A downgrade the resident is owed an explanation for — PRD Anti-Abuse layer
 * 9 ("Transparent downgrade"), the counterpart to layer 7's human override.
 */
export interface AlertDowngradeNotice {
  /** What the zone's alert said before the operator acted. */
  from: Severity;
  /** What it says now, or "none" if the alert was withdrawn entirely. */
  to: Severity | "none";
}

/**
 * The downgrade notice for a zone, from that zone's alerts.
 *
 * THE RECENCY WINDOW IS NOT HERE. `/api/alerts` returns active alerts plus
 * those superseded within six hours, so a superseded row reaching this
 * function is recent by construction. That keeps the window in one constant
 * as the spec requires — but it also means a caller who ever gets alerts from
 * somewhere other than that route loses it silently, and would tell a
 * resident an alert was just lifted two days after the fact. If a second
 * source of alerts ever appears, the window moves in here.
 */
export function resolveAlertDowngrade(
  alertsForZone: AlertRecord[]
): AlertDowngradeNotice | undefined {
  if (alertsForZone.length === 0) return undefined;

  // Sorted here rather than trusting the caller. The route does order by
  // issued_at desc, but this function is pure and used in loops, and a
  // consumer that filters or concatenates has already broken that order
  // without noticing.
  const newest = [...alertsForZone].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
  )[0];

  if (!newest.isActive) {
    // No active alert, and this row is inside the route's window: the alert
    // was withdrawn.
    return { from: newest.severity, to: "none" };
  }

  if (!newest.supersededSeverity) return undefined;

  const isLower =
    SEVERITY_ORDER.indexOf(newest.severity) < SEVERITY_ORDER.indexOf(newest.supersededSeverity);

  return isLower ? { from: newest.supersededSeverity, to: newest.severity } : undefined;
}
