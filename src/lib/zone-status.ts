import { SEVERITY_HEX } from "./severity";
import type { AlertRecord, LocalizedText } from "./types";

export type ZoneStatus = "safe" | "cautionary" | "dangerous" | "hazardous";

/** Green used only for the map's zero-state — not part of the alert severity scale. */
export const SAFE_HEX = "#22c55e";

/**
 * Plain-language map legend from PRD's "Homepage Map — Zone Status Legend".
 * This simplifies the *label* only; the underlying severity color grammar
 * (SEVERITY_HEX) is unchanged — see getZoneStatusColor.
 */
export function getZoneStatus(alert: AlertRecord | undefined): ZoneStatus {
  if (!alert) return "safe";
  switch (alert.severity) {
    case "yellow":
    case "orange":
      return "cautionary";
    case "red":
      return "dangerous";
    case "evacuate":
      return "hazardous";
  }
}

/** Returns the exact severity hex for an active alert, or the safe green for none. */
export function getZoneStatusColor(alert: AlertRecord | undefined): string {
  if (!alert) return SAFE_HEX;
  return SEVERITY_HEX[alert.severity];
}

export const ZONE_STATUS_LABEL: Record<ZoneStatus, LocalizedText> = {
  safe: { en: "Safe", fil: "Ligtas" },
  cautionary: { en: "Cautionary", fil: "Mag-ingat" },
  dangerous: { en: "Dangerous", fil: "Mapanganib" },
  hazardous: { en: "Hazardous", fil: "Lumikas Na" },
};
