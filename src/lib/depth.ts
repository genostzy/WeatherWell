import type { Severity } from "./severity";

export type DepthLevel = "dry" | "ankle" | "knee" | "waist" | "neck";

export const DEPTH_LEVELS: DepthLevel[] = ["dry", "ankle", "knee", "waist", "neck"];

export const DEPTH_LABEL: Record<DepthLevel, string> = {
  dry: "Dry",
  ankle: "Ankle-deep",
  knee: "Knee-deep",
  waist: "Waist-deep",
  neck: "Neck-deep",
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
