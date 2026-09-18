"use client";

import { AlertTriangle, ShieldCheck, CloudRain, Wind } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useAlerts } from "@/lib/alerts-store";
import { useZones } from "@/lib/reference-data/use-reference-data";
import { getZoneStatus } from "@/lib/zone-status";
import { getRainfallForZone, getWindForZone } from "@/lib/mock-data";
import type { LocalizedText } from "@/lib/types";

const ALERTS: LocalizedText = { en: "alerts", fil: "alert" };
const ZONES: LocalizedText = { en: "zones", fil: "zone" };
const ALL_CLEAR: LocalizedText = { en: "All clear", fil: "Ligtas lahat" };

/**
 * Compact stats bar showing key info at a glance:
 * - Active alert count (with severity color)
 * - Total zone count
 * - Quick weather badges (rain/wind)
 */
export function QuickStats() {
  const { lang } = useLanguage();
  const alerts = useAlerts();
  const zones = useZones();

  const activeAlerts = alerts.filter((a) => a.isActive);
  const alertCount = activeAlerts.length;

  // Count zones with the most severe status
  const hasDanger = activeAlerts.some((a) => getZoneStatus(a) === "dangerous" || getZoneStatus(a) === "hazardous");
  const hasCaution = activeAlerts.some((a) => getZoneStatus(a) === "cautionary");

  // Weather: check the selected zone (first zone) for notable conditions
  const primaryZone = zones[0];
  const rainfall = primaryZone ? getRainfallForZone(primaryZone.id) : 0;
  const wind = primaryZone ? getWindForZone(primaryZone.id) : 0;
  const hasRain = rainfall > 5;
  const hasWind = wind > 15;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {alertCount === 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 font-medium text-green-500">
          <ShieldCheck aria-hidden="true" className="h-3 w-3" />
          {t(ALL_CLEAR, lang)}
        </span>
      ) : (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${
            hasDanger
              ? "border-severity-red/30 bg-severity-red/10 text-severity-red"
              : hasCaution
                ? "border-severity-orange/30 bg-severity-orange/10 text-severity-orange"
                : "border-severity-yellow/30 bg-severity-yellow/10 text-severity-yellow"
          }`}
        >
          <AlertTriangle aria-hidden="true" className="h-3 w-3" />
          {alertCount} {t(ALERTS, lang)}
        </span>
      )}

      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-muted-foreground">
        {zones.length} {t(ZONES, lang)}
      </span>

      {hasRain && (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 font-medium text-blue-400">
          <CloudRain aria-hidden="true" className="h-3 w-3" />
          {rainfall}mm/hr
        </span>
      )}

      {hasWind && (
        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 font-medium text-cyan-400">
          <Wind aria-hidden="true" className="h-3 w-3" />
          {wind}km/h
        </span>
      )}
    </div>
  );
}
