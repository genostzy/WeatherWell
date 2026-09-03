import {
  getRainfallForZone,
  getRainfallHistoryForZone,
  hasThunderstormWatch,
  getHazardSusceptibilityForZone,
  getReportsTodayForZone,
  getActiveAlertForZone,
  REPORT_THRESHOLD,
} from "../mock-data";
import type { Zone } from "../types";
import type { Factor, TrendDirection, ZoneInput, ZoneState } from "./types";

const WEIGHTS = {
  rainfall: 0.4,
  crowdReports: 0.3,
  hazardBaseline: 0.2,
  cascade: 0.1,
};

const HAZARD_LEVEL_VALUE = { low: 0, medium: 0.5, high: 1 } as const;

/** A forecast watch nudges the rainfall factor up without needing its own weight class — see plan doc Stage 2. */
const THUNDERSTORM_WATCH_BONUS = 0.15;
/** Rainfall rate (mm/hr) that alone maxes out the rainfall factor. */
const RAINFALL_SATURATION_MM_PER_HOUR = 50;
/** reportCount24h at which the crowd-reports factor maxes out — 3x the auto-alert threshold, not the threshold itself, since this factor should keep climbing past "enough to alert" up to "overwhelming agreement." */
const REPORT_SATURATION_MULTIPLIER = 3;

/** Trend comparison needs the newer half to differ from the older half by more than this to call it a trend rather than noise. */
const TREND_THRESHOLD_RATIO = 0.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rainfallFactor(input: ZoneInput): number {
  const base = clamp(input.rainfallMmPerHour / RAINFALL_SATURATION_MM_PER_HOUR, 0, 1);
  const withWatch = input.thunderstormWatch ? base + THUNDERSTORM_WATCH_BONUS : base;
  return clamp(withWatch, 0, 1);
}

function crowdReportsFactor(input: ZoneInput): number {
  return clamp(input.reportCount24h / (REPORT_THRESHOLD * REPORT_SATURATION_MULTIPLIER), 0, 1);
}

function hazardBaselineFactor(input: ZoneInput): number {
  return HAZARD_LEVEL_VALUE[input.hazardSusceptibility.flood];
}

function cascadeFactor(input: ZoneInput): number {
  return input.cascadeFromUpstream ? 1 : 0;
}

function detectTrend(rainfallHistory: number[]): TrendDirection {
  if (rainfallHistory.length < 12) return "stable";
  const older = rainfallHistory.slice(0, 6);
  const newer = rainfallHistory.slice(6, 12);
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const olderMean = mean(older);
  const newerMean = mean(newer);
  if (olderMean === 0) return newerMean > 0 ? "escalating" : "stable";
  const change = (newerMean - olderMean) / olderMean;
  if (change > TREND_THRESHOLD_RATIO) return "escalating";
  if (change < -TREND_THRESHOLD_RATIO) return "improving";
  return "stable";
}

/**
 * Stage 2 — pure scoring function. Takes an already-built ZoneInput (see
 * buildZoneInputForZone below) and produces a ZoneState. No I/O, no mock-data
 * imports here by design — this function is the one that gets unit-tested
 * per scoring band; buildZoneInputForZone is the (thin) part that wires it
 * to real data.
 */
export function computeZoneState(input: ZoneInput): ZoneState {
  const factors: Factor[] = [
    { source: "rainfall", weight: WEIGHTS.rainfall, value: rainfallFactor(input) },
    { source: "crowd_reports", weight: WEIGHTS.crowdReports, value: crowdReportsFactor(input) },
    { source: "hazard_baseline", weight: WEIGHTS.hazardBaseline, value: hazardBaselineFactor(input) },
    { source: "cascade", weight: WEIGHTS.cascade, value: cascadeFactor(input) },
  ];

  const weightedSum = factors.reduce((sum, factor) => sum + factor.weight * factor.value, 0);
  const riskScore = Math.round(clamp(weightedSum, 0, 1) * 100);

  return {
    zoneId: input.zoneId,
    riskScore,
    confidence: input.reportCount24h >= REPORT_THRESHOLD ? "validated" : "estimated",
    trendDirection: detectTrend(input.rainfallHistory),
    contributingFactors: factors,
  };
}

/**
 * Builds a ZoneInput from the app's existing mock data — the thin wiring
 * layer between real (mock) sources and the pure scorer above. Cascade
 * resolution walks the existing Zone.downstreamZoneId chain rather than
 * requiring a separate upstream-state parameter; see plan doc's "Cascade
 * resolution" note for why a general topological sort isn't warranted for
 * a 4-node linear chain.
 */
export function buildZoneInputForZone(zone: Zone, allZones: Zone[]): ZoneInput {
  const upstreamZone = allZones.find((z) => z.downstreamZoneId === zone.id);
  const cascadeFromUpstream = upstreamZone ? getActiveAlertForZone(upstreamZone.id) !== undefined : false;

  return {
    zoneId: zone.id,
    rainfallMmPerHour: getRainfallForZone(zone.id),
    rainfallHistory: getRainfallHistoryForZone(zone.id),
    thunderstormWatch: hasThunderstormWatch(zone.id),
    hazardSusceptibility: getHazardSusceptibilityForZone(zone.id),
    reportCount24h: getReportsTodayForZone(zone.id),
    cascadeFromUpstream,
  };
}
