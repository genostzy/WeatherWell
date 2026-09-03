"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { useZoneOverrides, resolveEffectiveAlert } from "@/lib/zone-overrides";
import { getFriendlyWeatherRead } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

/**
 * The resident's own zone status, shown at the top of the homepage. Reuses
 * the same safe/cautionary/dangerous/hazardous scale (and exact severity
 * color) already driving the map markers and legend — this is a presentation
 * of that existing data, not a new status model. Also reflects any admin/zone
 * override (see zone-overrides.ts) so a barangay official's own edit — or an
 * admin's — is visible here immediately, not just on the dashboards.
 */
export function PersonalStatusHeadline({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();
  const alert = resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity);
  const status = getZoneStatus(alert);
  const color = getZoneStatusColor(alert);
  const Icon = status === "safe" ? ShieldCheck : TriangleAlert;
  // Safe: a friendly weather read from Current Conditions data. Otherwise: the
  // zone's actual active alert message — urgency is never diluted with
  // weather trivia. Per PRD Core Feature #9.
  const followUp = status === "safe" ? getFriendlyWeatherRead(zone.id) : alert?.message;

  return (
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
  );
}
