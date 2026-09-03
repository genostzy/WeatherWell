"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mountain } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getHazardSusceptibilityForZone, getRainfallForZone, hasElevatedLandslideRisk } from "@/lib/mock-data";
import type { HazardRiskLevel, LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Landslide Risk Alerts", fil: "Alerto sa Panganib ng Guho" };
const SUSCEPTIBILITY_LABEL: Record<HazardRiskLevel, LocalizedText> = {
  low: { en: "Low", fil: "Mababa" },
  medium: { en: "Medium", fil: "Katamtaman" },
  high: { en: "High", fil: "Mataas" },
};
const ELEVATED_NOW: LocalizedText = {
  en: "Elevated now — heavy rain on susceptible terrain",
  fil: "Tumaas ang panganib — malakas na ulan sa lupaing madaling maguho",
};
const NORMAL: LocalizedText = { en: "Normal", fil: "Normal" };

export function LandslideRiskPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mountain aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {zones.map((zone) => {
          const susceptibility = getHazardSusceptibilityForZone(zone.id).landslide;
          const elevated = hasElevatedLandslideRisk(susceptibility, getRainfallForZone(zone.id));
          return (
            <div key={zone.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{zone.name}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {t(SUSCEPTIBILITY_LABEL[susceptibility], lang)}
                </Badge>
                {elevated ? (
                  <Badge className="bg-severity-red text-white">{t(ELEVATED_NOW, lang)}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">{t(NORMAL, lang)}</span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
