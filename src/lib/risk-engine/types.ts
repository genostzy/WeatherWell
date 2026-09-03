import type { ConfidenceLevel, HazardRiskLevel, HazardType } from "../types";

/**
 * Stage 2 (scoring) input only — see docs/plans/2026-09-03-risk-engine-simulation-climate-resilience.md.
 * This is deliberately a small, real-inputs-only set: every field here is
 * something mock-data already computes today. Fields the original draft of
 * this plan proposed (upstreamZoneState, tideHeightM, damReleaseM3s,
 * seasonalBaseline, falseAlarmRate, registeredVulnerable, windKph,
 * heatIndexC, ...) were cut because nothing in this app can populate them
 * yet — they belong to Phase 3's calibration loop or a future ingest stage
 * that isn't built.
 */
export interface ZoneInput {
  zoneId: string;
  rainfallMmPerHour: number;
  /** Twelve hourly readings, oldest first — same shape as getRainfallHistoryForZone. */
  rainfallHistory: number[];
  thunderstormWatch: boolean;
  hazardSusceptibility: Record<HazardType, HazardRiskLevel>;
  reportCount24h: number;
  /** True if the zone immediately upstream (via Zone.downstreamZoneId) currently has an active alert. */
  cascadeFromUpstream: boolean;
}

export type TrendDirection = "improving" | "stable" | "escalating";

export interface Factor {
  source: "rainfall" | "crowd_reports" | "hazard_baseline" | "cascade";
  /** The fixed weight this factor carries in the formula, for display/debugging. */
  weight: number;
  /** This factor's own 0–1 contribution before weighting. */
  value: number;
}

export interface ZoneState {
  zoneId: string;
  /** 0–100, clamped. */
  riskScore: number;
  /** Only "estimated"/"validated" are reachable in Phase 1 — "calibrated" needs Phase 3's real audit trail. */
  confidence: Exclude<ConfidenceLevel, "calibrated">;
  trendDirection: TrendDirection;
  contributingFactors: Factor[];
}
