import type { Severity } from "./severity";
import type { LocalizedText } from "./types";

export type DepthLevel = "dry" | "ankle" | "knee" | "waist" | "neck";

export const DEPTH_LEVELS: DepthLevel[] = ["dry", "ankle", "knee", "waist", "neck"];

/**
 * The whole vocabulary of the water-level report, so localized per the
 * project's global constraint. Filipino uses the everyday "hanggang <body
 * part>" phrasing people actually say when describing flood depth.
 */
export const DEPTH_LABEL: Record<DepthLevel, LocalizedText> = {
  dry: { en: "Dry", fil: "Walang baha" },
  ankle: { en: "Ankle-deep", fil: "Hanggang bukong-bukong" },
  knee: { en: "Knee-deep", fil: "Hanggang tuhod" },
  waist: { en: "Waist-deep", fil: "Hanggang baywang" },
  neck: { en: "Neck-deep", fil: "Hanggang leeg" },
};

/** Approximate water depth in centimetres for each reported level. */
export const DEPTH_CM: Record<DepthLevel, number> = {
  dry: 0,
  ankle: 15,
  knee: 45,
  waist: 90,
  neck: 150,
};

/**
 * Shifted one severity tier earlier than a naive linear mapping would
 * suggest: `waist` and `neck` both land on `evacuate`, not just `neck`. The
 * same nominal depth is far more dangerous for a child than an adult (a
 * child is 110cm tall — "waist" on the adult scale is already near a
 * child's shoulders), so waiting for the most extreme adult-scale reading
 * to call for evacuation would already be too late for the more vulnerable
 * person standing in the same water.
 */
export const DEPTH_SEVERITY: Record<DepthLevel, Severity> = {
  dry: "yellow",
  ankle: "orange",
  knee: "red",
  waist: "evacuate",
  neck: "evacuate",
};

/** Percentage of a figure of the given height that the water covers. */
export function depthFillPercent(depthCm: number, figureHeightCm: number): number {
  const percent = (depthCm / figureHeightCm) * 100;
  return Math.max(0, Math.min(100, percent));
}
