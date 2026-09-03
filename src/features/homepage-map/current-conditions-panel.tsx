"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CloudRain } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import {
  getRainfallForZone,
  getWindForZone,
  hasThunderstormWatch,
  getHeatIndexForZone,
  getHeatIndexCategory,
  getHazardSusceptibilityForZone,
  hasElevatedLandslideRisk,
  MOCK_TYPHOON,
  MOCK_DROUGHT_OUTLOOK,
  type HeatIndexCategory,
} from "@/lib/mock-data";
import type { LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Current Conditions", fil: "Kasalukuyang Kondisyon" };
const RAINFALL: LocalizedText = { en: "Rainfall", fil: "Ulan" };
const WIND: LocalizedText = { en: "Wind", fil: "Hangin" };
const TYPHOON_TRACK: LocalizedText = { en: "Typhoon track", fil: "Landas ng Bagyo" };
const NO_ACTIVE_SYSTEM: LocalizedText = { en: "No active tropical cyclone", fil: "Walang aktibong bagyo" };
const THUNDERSTORM_WATCH: LocalizedText = {
  en: "Thunderstorm watch in effect",
  fil: "May thunderstorm watch",
};
const HEAT_INDEX: LocalizedText = { en: "Heat index", fil: "Heat Index" };
const DROUGHT_OUTLOOK: LocalizedText = { en: "Drought / dry-spell outlook", fil: "Outlook sa Tagtuyot" };
const UPDATED_RECENTLY: LocalizedText = { en: "Rainfall, wind, typhoon & thunderstorm: updated minutes ago", fil: "Ulan, hangin, bagyo at thunderstorm: na-update ilang minuto ang nakaraan" };
const UPDATED_WEEKLY: LocalizedText = { en: "Heat index & drought outlook: updated weekly", fil: "Heat index at drought outlook: lingguhang na-a-update" };
const LANDSLIDE_CAUTION: LocalizedText = {
  en: "Caution: heavy rain on landslide-prone ground nearby.",
  fil: "Pag-ingat: malakas na ulan sa lupaing madaling maguho.",
};
const SEE_LESS: LocalizedText = { en: "See less", fil: "Bawasan" };
const SEE_DETAILS: LocalizedText = { en: "See details", fil: "Tingnan ang detalye" };

const HEAT_CATEGORY_LABEL: Record<HeatIndexCategory, LocalizedText> = {
  caution: { en: "Caution", fil: "Pag-ingat" },
  extreme_caution: { en: "Extreme Caution", fil: "Sobrang Pag-iingat" },
  danger: { en: "Danger", fil: "Delikado" },
  extreme_danger: { en: "Extreme Danger", fil: "Matinding Delikado" },
};

/**
 * Collapsed-by-default per PRD's progressive-disclosure principle — sits
 * between the personal status headline and the map (see HomepageMap), read-only
 * and purely informational (no severity scale, no alert, no crowd reports
 * attached to any reading here, per Core Feature #10).
 */
export function CurrentConditionsPanel({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const rainfall = getRainfallForZone(zone.id);
  const wind = getWindForZone(zone.id);
  const thunderstorm = hasThunderstormWatch(zone.id);
  const heatIndex = getHeatIndexForZone(zone.id);
  const heatCategory = getHeatIndexCategory(heatIndex);
  const landslideSusceptibility = getHazardSusceptibilityForZone(zone.id).landslide;
  const landslideCaution = hasElevatedLandslideRisk(landslideSusceptibility, rainfall);
  const ChevronIcon = expanded ? ChevronUp : ChevronDown;

  return (
    <Card className="w-full max-w-2xl gap-0 lg:max-w-5xl">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="current-conditions-detail"
        className="flex w-full items-center justify-between gap-2 px-(--card-spacing) text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <CloudRain aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span lang={lang}>{t(TITLE, lang)}</span>
          <span className="truncate font-normal text-muted-foreground">
            · {rainfall}mm/hr · {wind}km/h
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {t(expanded ? SEE_LESS : SEE_DETAILS, lang)}
          <ChevronIcon aria-hidden="true" className="h-4 w-4" />
        </span>
      </button>

      {expanded && (
        <CardContent id="current-conditions-detail" className="space-y-3 pt-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span>{t(RAINFALL, lang)}</span>
            <span className="font-medium">{rainfall} mm/hr</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{t(WIND, lang)}</span>
            <span className="font-medium">{wind} km/h</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{t(TYPHOON_TRACK, lang)}</span>
            <span className="text-right font-medium">
              {MOCK_TYPHOON
                ? `${MOCK_TYPHOON.name} — ${MOCK_TYPHOON.distanceKm}km ${MOCK_TYPHOON.bearing}`
                : t(NO_ACTIVE_SYSTEM, lang)}
            </span>
          </div>
          {thunderstorm && (
            <p lang={lang} className="font-medium text-severity-orange">
              {t(THUNDERSTORM_WATCH, lang)}
            </p>
          )}

          <Separator />

          <div className="flex items-center justify-between gap-2">
            <span>{t(HEAT_INDEX, lang)}</span>
            <span className="font-medium">
              {heatIndex}°C · {t(HEAT_CATEGORY_LABEL[heatCategory], lang)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{t(DROUGHT_OUTLOOK, lang)}</span>
            <span lang={lang} className="text-right font-medium">
              {t(MOCK_DROUGHT_OUTLOOK, lang)}
            </span>
          </div>

          {landslideCaution && (
            <p lang={lang} className="font-medium text-severity-red">
              {t(LANDSLIDE_CAUTION, lang)}
            </p>
          )}

          <p lang={lang} className="text-xs text-muted-foreground">
            {t(UPDATED_RECENTLY, lang)}. {t(UPDATED_WEEKLY, lang)}.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
