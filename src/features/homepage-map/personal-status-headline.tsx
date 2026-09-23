"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { resolveAlertDowngrade } from "@/lib/alert-downgrade";
import { useActiveAlertForZone, useAlerts } from "@/lib/alerts-store";
import { AlertDowngradeNotice } from "@/features/alerts/alert-downgrade-notice";
import { useWeatherData } from "@/lib/use-weather-data";
import { friendlyWeatherRead } from "@/lib/weather-read";
import type { Zone } from "@/lib/types";

/**
 * The resident's own zone status, shown at the top of the homepage.
 * Redesigned as a prominent hero card with a severity-colored accent bar,
 * larger icon, and clear visual hierarchy. Reuses the same
 * safe/cautionary/dangerous/hazardous scale (and exact severity color)
 * already driving the map markers and legend.
 */
export function PersonalStatusHeadline({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const alert = useActiveAlertForZone(zone.id);
  const alerts = useAlerts();
  const downgrade = resolveAlertDowngrade(alerts.filter((a) => a.zoneId === zone.id));
  const status = getZoneStatus(alert);
  const color = getZoneStatusColor(alert);
  const Icon = status === "safe" ? ShieldCheck : TriangleAlert;
  // Safe: a friendly weather read. Otherwise: the zone's actual alert message.
  const { current } = useWeatherData(zone.id);
  const followUp = status === "safe" ? friendlyWeatherRead(current) : alert?.message;

  return (
    <div className="w-full space-y-2">
      <div
        className="relative w-full overflow-hidden rounded-xl border-2 border-border"
        style={{ borderColor: color }}
      >
        {/* Severity accent bar — left edge */}
        <div
          className="absolute top-0 left-0 h-full w-1"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />

        <div className="flex items-start gap-3 p-4 pl-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${color}1a` }}
          >
            <Icon aria-hidden="true" className="h-6 w-6" style={{ color }} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{zone.name}</p>
            <h1
              lang={lang}
              className="text-lg font-bold leading-tight md:text-xl"
              style={{ color }}
            >
              {t(ZONE_STATUS_LABEL[status], lang)}
            </h1>
            {followUp && (
              <p lang={lang} className="mt-1 text-sm text-muted-foreground">
                {t(followUp, lang)}
              </p>
            )}
          </div>
        </div>
      </div>

      {downgrade && <AlertDowngradeNotice notice={downgrade} />}
    </div>
  );
}
