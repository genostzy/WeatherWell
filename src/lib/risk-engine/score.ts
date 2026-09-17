import {
  getRainfallForZone,
  getRainfallHistoryForZone,
  hasThunderstormWatch,
  getReportsTodayForZone,
  REPORT_THRESHOLD,
} from "../mock-data";
import { hazardsForZone, type HazardsByZone } from "../hazards";
import type { Zone } from "../types";
import type { Factor, TrendDirection, ZoneInput, ZoneState } from "./types";

/** Optional real weather data overrides. When provided, these take precedence over mock functions. */
export interface WeatherOverrides {
  rainfallMmPerHour?: number;
  rainfallHistory?: number[];
  thunderstormWatch?: boolean;
}

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

/** Null when the flood level is unknown: there is no baseline to contribute. */
function hazardBaselineFactor(input: ZoneInput): number | null {
  const level = input.hazardSusceptibility.flood;
  return level === "unknown" ? null : HAZARD_LEVEL_VALUE[level];
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
  const hazardBaseline = hazardBaselineFactor(input);
  const factors: Factor[] = [
    { source: "rainfall", weight: WEIGHTS.rainfall, value: rainfallFactor(input) },
    { source: "crowd_reports", weight: WEIGHTS.crowdReports, value: crowdReportsFactor(input) },
    ...(hazardBaseline === null
      ? []
      : [{ source: "hazard_baseline" as const, weight: WEIGHTS.hazardBaseline, value: hazardBaseline }]),
    { source: "cascade", weight: WEIGHTS.cascade, value: cascadeFactor(input) },
  ];

  const weightedSum = factors.reduce((sum, factor) => sum + factor.weight * factor.value, 0);
  // An unknown flood baseline is excluded, not scored as low (I3). Scoring it
  // 0 would quietly understate risk for every unrated barangay, so the
  // remaining weights are renormalised to cover the whole scale. With every
  // factor known the divisor is exactly 1, leaving existing scores untouched.
  const knownWeight = hazardBaseline === null ? factors.reduce((sum, factor) => sum + factor.weight, 0) : 1;
  const riskScore = Math.round(clamp(weightedSum / knownWeight, 0, 1) * 100);

  return {
    zoneId: input.zoneId,
    riskScore,
    // A score missing one of its inputs is never "validated".
    confidence: input.reportCount24h >= REPORT_THRESHOLD && hazardBaseline !== null ? "validated" : "estimated",
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
 *
 * `upstreamHasActiveAlert` is a required parameter rather than a defaulted
 * one. It used to read the mock alert directly, so the cascade factor ignored
 * an operator clearing or raising the upstream zone's alert and the dashboard
 * tile silently disagreed with the operator's own decision. A default would
 * have let a future call site reintroduce exactly that, quietly; requiring it
 * forces each caller to say which notion of "alerting" it means.
 *
 * `hazards` is likewise required rather than defaulted. This function is a
 * plain (non-hook) function called from inside `.map()` over arbitrary zones,
 * so it cannot call `useHazardsForZone` itself — the caller must fetch the
 * bulk map once via `useHazards()` and pass it in. A default here would let a
 * future call site silently fall back to stale or empty data instead of
 * wiring the hook up correctly. A zone missing from `hazards`, or missing a
 * hazard type, reads "unknown" for it via hazardsForZone (I3).
 *
 * `weatherOverrides` is optional. When provided (from real DB readings), these
 * values take precedence over the mock functions. This allows a gradual
 * migration: existing callers pass nothing and get mocks; new callers pass
 * real data from the weather API.
 */
export function buildZoneInputForZone(
  zone: Zone,
  allZones: Zone[],
  upstreamHasActiveAlert: (zoneId: string) => boolean,
  hazards: HazardsByZone,
  weatherOverrides?: WeatherOverrides
): ZoneInput {
  const upstreamZone = allZones.find((z) => z.downstreamZoneId === zone.id);
  const cascadeFromUpstream = upstreamZone ? upstreamHasActiveAlert(upstreamZone.id) : false;

  return {
    zoneId: zone.id,
    rainfallMmPerHour: weatherOverrides?.rainfallMmPerHour ?? getRainfallForZone(zone.id),
    rainfallHistory: weatherOverrides?.rainfallHistory ?? getRainfallHistoryForZone(zone.id),
    thunderstormWatch: weatherOverrides?.thunderstormWatch ?? hasThunderstormWatch(zone.id),
    hazardSusceptibility: hazardsForZone(hazards, zone.id),
    reportCount24h: getReportsTodayForZone(zone.id),
    cascadeFromUpstream,
  };
}
