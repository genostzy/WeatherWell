"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { resolveAlertDowngrade } from "@/lib/alert-downgrade";
import { useActiveAlertForZone, useAlerts } from "@/lib/alerts-store";
import { AlertDowngradeNotice } from "@/features/alerts/alert-downgrade-notice";
import { getFriendlyWeatherRead } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

/**
 * The resident's own zone status, shown at the top of the homepage. Reuses
 * the same safe/cautionary/dangerous/hazardous scale (and exact severity
 * color) already driving the map markers and legend — this is a presentation
 * of that existing data, not a new status model. Also reflects an operator's
 * own edit to the zone's alert (see set-zone-alert.ts) immediately, not just
 * on the dashboards, since both read the same Postgres row.
 */
export function PersonalStatusHeadline({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const alert = useActiveAlertForZone(zone.id);
  const alerts = useAlerts();
  const downgrade = resolveAlertDowngrade(alerts.filter((a) => a.zoneId === zone.id));
  const status = getZoneStatus(alert);
  const color = getZoneStatusColor(alert);
  const Icon = status === "safe" ? ShieldCheck : TriangleAlert;
  // Safe: a friendly weather read from Current Conditions data. Otherwise: the
  // zone's actual active alert message — urgency is never diluted with
  // weather trivia. Per PRD Core Feature #9.
  const followUp = status === "safe" ? getFriendlyWeatherRead(zone.id) : alert?.message;

  return (
    <div className="w-full space-y-2">
      <div
        className="flex w-full max-w-2xl items-center gap-3 rounded-md border-2 p-3 lg:max-w-5xl"
        style={{ borderColor: color, backgroundColor: `${color}1a` }}
      >
        <Icon aria-hidden="true" className="h-8 w-8 shrink-0" style={{ color }} />
        <div>
          <p className="text-xs text-muted-foreground">{zone.name}</p>
          <h1 lang={lang} className="text-lg font-semibold md:text-xl" style={{ color }}>
            {t(ZONE_STATUS_LABEL[status], lang)}
          </h1>
          {followUp && (
            <p lang={lang} className="text-sm text-muted-foreground">
              {t(followUp, lang)}
            </p>
          )}
        </div>
      </div>

      {/*
        Sits directly under the status it explains. When an operator clears an
        alert this headline flips to "Safe" with a weather blurb — a change
        indistinguishable from nothing ever having been wrong, unless the
        withdrawal is stated (PRD Anti-Abuse layer 9).
      */}
      {downgrade && <AlertDowngradeNotice notice={downgrade} />}
    </div>
  );
}
