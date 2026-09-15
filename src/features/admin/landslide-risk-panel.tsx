"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mountain } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getRainfallForZone, hasElevatedLandslideRisk } from "@/lib/mock-data";
import { useHazardsForZone } from "@/lib/reference-data/use-reference-data";
import { HAZARD_LEVEL_LABEL } from "@/lib/hazards";
import type { LanguageCode, LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Landslide Risk Alerts", fil: "Alerto sa Panganib ng Guho" };
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
        {zones.map((zone) => (
          <LandslideRiskRow key={zone.id} zone={zone} lang={lang} />
        ))}
      </CardContent>
    </Card>
  );
}

function LandslideRiskRow({ zone, lang }: { zone: Zone; lang: LanguageCode }) {
  const susceptibility = useHazardsForZone(zone.id).landslide;
  const elevated = hasElevatedLandslideRisk(susceptibility, getRainfallForZone(zone.id));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-medium">{zone.name}</span>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {t(HAZARD_LEVEL_LABEL[susceptibility], lang)}
        </Badge>
        {elevated ? (
          <Badge className="bg-severity-red text-white">{t(ELEVATED_NOW, lang)}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">{t(NORMAL, lang)}</span>
        )}
      </div>
    </div>
  );
}
