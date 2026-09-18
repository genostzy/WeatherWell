"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CloudRain } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import {
  getRainfallForZone,
  getWindForZone,
  hasThunderstormWatch,
  getHeatIndexForZone,
  getHeatIndexCategory,
  hasElevatedLandslideRisk,
  MOCK_TYPHOON,
  MOCK_DROUGHT_OUTLOOK,
  type HeatIndexCategory,
} from "@/lib/mock-data";
import { useHazardsForZone } from "@/lib/reference-data/use-reference-data";
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
const UPDATED_RECENTLY: LocalizedText = { en: "Updated minutes ago", fil: "Na-update ilang minuto ang nakaraan" };
const UPDATED_WEEKLY: LocalizedText = { en: "Heat & drought: updated weekly", fil: "Heat at drought: lingguhang na-a-update" };
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
 * Collapsed-by-default per PRD's progressive-disclosure principle.
 * Enhanced with severity-colored icon when conditions are concerning,
 * and a more compact, data-forward layout.
 */
export function CurrentConditionsPanel({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const rainfall = getRainfallForZone(zone.id);
  const wind = getWindForZone(zone.id);
  const thunderstorm = hasThunderstormWatch(zone.id);
  const heatIndex = getHeatIndexForZone(zone.id);
  const heatCategory = getHeatIndexCategory(heatIndex);
  const landslideSusceptibility = useHazardsForZone(zone.id).landslide;
  const landslideCaution = hasElevatedLandslideRisk(landslideSusceptibility, rainfall);
  const ChevronIcon = expanded ? ChevronUp : ChevronDown;

  const hasConcern = thunderstorm || landslideCaution || heatCategory === "danger" || heatCategory === "extreme_danger";
  const iconColor = hasConcern ? "text-severity-orange" : "text-muted-foreground";

  return (
    <div className="w-full overflow-hidden rounded-xl border-2 border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="current-conditions-detail"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-medium">
          <CloudRain aria-hidden="true" className={`h-4 w-4 shrink-0 ${iconColor}`} />
          <span lang={lang} className="whitespace-nowrap">{t(TITLE, lang)}</span>
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
        <div id="current-conditions-detail" className="space-y-2 border-t border-border px-4 pb-4 pt-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(RAINFALL, lang)}</span>
            <span className="font-medium tabular-nums">{rainfall} mm/hr</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(WIND, lang)}</span>
            <span className="font-medium tabular-nums">{wind} km/h</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(TYPHOON_TRACK, lang)}</span>
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

          <div className="my-2 h-px bg-border" />

          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(HEAT_INDEX, lang)}</span>
            <span className="font-medium tabular-nums">
              {heatIndex}°C · {t(HEAT_CATEGORY_LABEL[heatCategory], lang)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(DROUGHT_OUTLOOK, lang)}</span>
            <span lang={lang} className="text-right font-medium">
              {t(MOCK_DROUGHT_OUTLOOK, lang)}
            </span>
          </div>

          {landslideCaution && (
            <p lang={lang} className="font-medium text-severity-red">
              {t(LANDSLIDE_CAUTION, lang)}
            </p>
          )}

          <p lang={lang} className="pt-1 text-xs text-muted-foreground">
            {t(UPDATED_RECENTLY, lang)}. {t(UPDATED_WEEKLY, lang)}.
          </p>
        </div>
      )}
    </div>
  );
}
