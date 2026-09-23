import type { LocalizedText } from "./types";

/**
 * Idea 8: a barangay can span a riverbank and a hillside, so "your barangay"
 * cannot say whether your own spot is low-lying. Open-Meteo's free elevation
 * data (no key) can: compare where the resident stands with the barangay
 * centre. ponytail: the centre is the only reference point we have; add the
 * nearest river's level if a free source for it turns up.
 */
export interface Point {
  lat: number;
  lng: number;
}

export function buildElevationUrl(points: Point[]): string {
  const lats = points.map((p) => p.lat).join(",");
  const lngs = points.map((p) => p.lng).join(",");
  return `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
}

export function parseElevation(reply: unknown, expected: number): number[] | null {
  const values = (reply as { elevation?: unknown })?.elevation;
  if (!Array.isArray(values) || values.length !== expected) return null;
  return values.every((v) => typeof v === "number" && Number.isFinite(v)) ? (values as number[]) : null;
}

const LEVEL_WITHIN_M = 2;

export function describeElevation(here: number, centre: number): LocalizedText {
  const diff = Math.round(here - centre);
  if (Math.abs(here - centre) <= LEVEL_WITHIN_M) {
    return {
      en: `You are about the same height as your barangay centre (${Math.round(here)} m above sea level).`,
      fil: `Halos kasing-taas ka ng gitna ng inyong barangay (${Math.round(here)} m mula sa dagat).`,
    };
  }
  if (diff < 0) {
    return {
      en: `You are about ${-diff} m lower than your barangay centre. Water gathers here first — move to higher ground early.`,
      fil: `Mga ${-diff} m kang mas mababa kaysa sa gitna ng inyong barangay. Dito unang naiipon ang tubig — lumipat agad sa mataas na lugar.`,
    };
  }
  return {
    en: `You are about ${diff} m higher than your barangay centre. Still follow your barangay's alerts.`,
    fil: `Mga ${diff} m kang mas mataas kaysa sa gitna ng inyong barangay. Sundin pa rin ang alerto ng inyong barangay.`,
  };
}
