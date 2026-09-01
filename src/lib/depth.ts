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

export const DEPTH_SEVERITY: Record<DepthLevel, Severity> = {
  dry: "yellow",
  ankle: "yellow",
  knee: "orange",
  waist: "red",
  neck: "evacuate",
};

/** Percentage of a figure of the given height that the water covers. */
export function depthFillPercent(depthCm: number, figureHeightCm: number): number {
  const percent = (depthCm / figureHeightCm) * 100;
  return Math.max(0, Math.min(100, percent));
}
