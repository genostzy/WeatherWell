"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Droplet } from "lucide-react";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getHazardSusceptibilityForZone } from "@/lib/mock-data";
import { useZoneOverrides, resolveEffectiveAlert } from "@/lib/zone-overrides";
import type { HazardRiskLevel, LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Flood Monitoring", fil: "Pagsubaybay sa Baha" };
const CLEAR: LocalizedText = { en: "Clear", fil: "Ligtas" };
const SUSCEPTIBILITY_LABEL: Record<HazardRiskLevel, LocalizedText> = {
  low: { en: "Low susceptibility", fil: "Mababang panganib" },
  medium: { en: "Medium susceptibility", fil: "Katamtamang panganib" },
  high: { en: "High susceptibility", fil: "Mataas na panganib" },
};

export function FloodMonitoringPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplet aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {zones.map((zone) => {
          const alert = resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity);
          const susceptibility = getHazardSusceptibilityForZone(zone.id).flood;
          return (
            <div key={zone.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{zone.name}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {t(SUSCEPTIBILITY_LABEL[susceptibility], lang)}
                </Badge>
                {alert ? (
                  <SeverityBadge severity={alert.severity} />
                ) : (
                  <span className="text-sm text-green-500">{t(CLEAR, lang)}</span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
