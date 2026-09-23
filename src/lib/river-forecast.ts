/**
 * Idea 1: rain forecasts warn hours ahead; river forecasts warn days ahead.
 * Open-Meteo's flood API (GloFAS river discharge, free, no key) gives daily
 * flow for the nearest modelled river. We compare the coming week's peak with
 * today's flow rather than a long-term normal, which the API doesn't give.
 * ponytail: GloFAS cells are ~5 km, so small creeks are not in it; rivers
 * under 1 m³/s are skipped as "no real river here".
 */
export interface RiverSummary {
  trend: "rising" | "steady" | "falling";
  todayM3s: number;
  /** Highest expected daily flow in the next week (ensemble mean). */
  peakM3s: number;
  peakDate: string;
  /** Worst case across the ensemble in the next week. */
  worstM3s: number;
}

const RISING_RATIO = 1.5;
const FALLING_RATIO = 0.85;
const MIN_REAL_RIVER_M3S = 1;

export function buildRiverUrl(lat: number, lng: number): string {
  return `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lng}&daily=river_discharge,river_discharge_max&past_days=7&forecast_days=7`;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function summarizeRiver(reply: unknown, today: string): RiverSummary | null {
  const daily = (reply as { daily?: Record<string, unknown> })?.daily;
  const time = daily?.time;
  const flow = daily?.river_discharge;
  const max = daily?.river_discharge_max;
  if (!Array.isArray(time) || !Array.isArray(flow) || !Array.isArray(max)) return null;
  if (flow.length !== time.length || max.length !== time.length) return null;

  const i = time.indexOf(today);
  if (i < 0 || i === time.length - 1) return null;
  const ahead = flow.slice(i + 1);
  const aheadMax = max.slice(i + 1);
  const todayFlow = flow[i];
  if (!isNumber(todayFlow) || !ahead.every(isNumber) || !aheadMax.every(isNumber)) return null;
  if (todayFlow < MIN_REAL_RIVER_M3S) return null;

  const peak = Math.max(...(ahead as number[]));
  const peakDate = time[i + 1 + (ahead as number[]).indexOf(peak)] as string;
  const last = (ahead as number[])[ahead.length - 1];
  const trend =
    peak >= todayFlow * RISING_RATIO ? "rising" : last <= todayFlow * FALLING_RATIO ? "falling" : "steady";

  return {
    trend,
    todayM3s: Math.round(todayFlow),
    peakM3s: Math.round(peak),
    peakDate,
    worstM3s: Math.round(Math.max(...(aheadMax as number[]))),
  };
}

export function describeRiver(r: RiverSummary, lang: "en" | "fil"): string {
  if (r.trend === "rising") {
    // The API's dates are UTC calendar days; name the weekday in UTC too.
    const day = new Date(`${r.peakDate}T00:00:00Z`).toLocaleDateString(lang === "fil" ? "fil-PH" : "en-PH", {
      weekday: "short",
      timeZone: "UTC",
    });
    const ratio = r.peakM3s / r.todayM3s;
    // One decimal below 3x: rounding 1.5x up to "2x" would overstate it.
    const times = ratio < 3 ? ratio.toFixed(1) : String(Math.round(ratio));
    return lang === "fil"
      ? `Tumataas: hanggang ${r.peakM3s} m³/s pagdating ng ${day} (mga ${times}× ngayon). Bantayan ang mababang lugar malapit sa ilog.`
      : `Rising: up to ${r.peakM3s} m³/s by ${day} (about ${times}× today). Watch low ground near the river.`;
  }
  if (r.trend === "steady") return lang === "fil" ? `Tuloy-tuloy, mga ${r.todayM3s} m³/s` : `Steady, about ${r.todayM3s} m³/s`;
  return lang === "fil" ? `Bumababa, ngayon ${r.todayM3s} m³/s` : `Falling, now ${r.todayM3s} m³/s`;
}
