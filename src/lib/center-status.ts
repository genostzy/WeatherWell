import type { CenterStatus } from "./types";
import type { LocalizedText } from "./types";

export const CENTER_STATUS_LABEL: Record<CenterStatus, LocalizedText> = {
  space_available: { en: "Space available", fil: "May espasyo" },
  limited: { en: "Limited space", fil: "Kakaunting espasyo" },
  full: { en: "Full", fil: "Puno na" },
};

export const CENTER_STATUS_CLASS: Record<CenterStatus, string> = {
  space_available: "bg-green-500/20 text-green-400",
  limited: "bg-yellow-500/20 text-yellow-400",
  full: "bg-red-500/20 text-red-400",
};

export const CENTER_STATUS_ORDER: CenterStatus[] = ["space_available", "limited", "full"];
