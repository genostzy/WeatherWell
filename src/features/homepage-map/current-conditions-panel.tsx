"use client";

import { useState } from "react";
import { BulletinAge } from "@/components/bulletin-age";
import { ChevronDown, ChevronUp, CloudRain } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getHeatIndexCategory, hasElevatedLandslideRisk, type HeatIndexCategory } from "@/lib/weather-thresholds";
import { useWeatherData } from "@/lib/use-weather-data";
import { isThunderstorm } from "@/lib/open-meteo";
import { useTyphoon } from "@/lib/use-typhoon";
import { useHazardsForZone } from "@/lib/reference-data/use-reference-data";
import type { LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Current Conditions", fil: "Kasalukuyang Kondisyon" };
const RAINFALL: LocalizedText = { en: "Rainfall", fil: "Ulan" };
const WIND: LocalizedText = { en: "Wind", fil: "Hangin" };
const TYPHOON_TRACK: LocalizedText = { en: "Typhoon track", fil: "Landas ng Bagyo" };
const NO_ACTIVE_SYSTEM: LocalizedText = { en: "No active tropical cyclone", fil: "Walang aktibong bagyo" };
const THUNDERSTORM_WATCH: LocalizedText = {
  en: "Thunderstorm in the area",
  fil: "May bagyong may kulog sa lugar",
};
const HEAT_INDEX: LocalizedText = { en: "Feels like", fil: "Pakiramdam" };
const SOURCE: LocalizedText = { en: "Live data from Open-Meteo, updated hourly", fil: "Live na datos mula sa Open-Meteo, bawat oras" };
const NO_READING: LocalizedText = { en: "No live weather reading right now", fil: "Walang live na ulat ng panahon ngayon" };
const LANDSLIDE_CAUTION: LocalizedText = {
  en: "Caution: heavy rain on landslide-prone ground nearby.",
  fil: "Pag-ingat: malakas na ulan sa lupaing madaling maguho.",
};
const SEE_LESS: LocalizedText = { en: "See less", fil: "Bawasan" };
const SEE_DETAILS: LocalizedText = { en: "See details", fil: "Tingnan ang detalye" };
const SIGNAL_WARNING: LocalizedText = {
  en: "Wind signal in effect",
  fil: "May wind signal na naka-angat",
};

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
  const { track } = useTyphoon();

  const { current } = useWeatherData(zone.id);
  const rainfall = current ? current.rainfall_mm : null;
  const wind = current ? Math.round(current.wind_kph) : null;
  const thunderstorm = current ? isThunderstorm(current.weather_code) : false;
  const heatIndex = current ? Math.round(current.apparent_temperature_c) : null;
  const heatCategory = heatIndex === null ? null : getHeatIndexCategory(heatIndex);
  const landslideSusceptibility = useHazardsForZone(zone.id).landslide;
  const landslideCaution = rainfall !== null && hasElevatedLandslideRisk(landslideSusceptibility, rainfall);
  const shown = (value: number | null, unit: string) => (value === null ? "—" : value + unit);
  const ChevronIcon = expanded ? ChevronUp : ChevronDown;

  const hasSignalWarning = track && track.wind_signal > 0;
  const hasConcern = thunderstorm || landslideCaution || heatCategory === "danger" || heatCategory === "extreme_danger" || !!hasSignalWarning;
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
            · {shown(rainfall, "mm/hr")} · {shown(wind, "km/h")}
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
            <span className="font-medium tabular-nums">{shown(rainfall, " mm/hr")}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(WIND, lang)}</span>
            <span className="font-medium tabular-nums">{shown(wind, " km/h")}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(TYPHOON_TRACK, lang)}</span>
            <span className="text-right font-medium">
              {track
                ? `${track.name} — ${track.wind_signal > 0 ? `Signal ${track.wind_signal}` : "No signal"}`
                : t(NO_ACTIVE_SYSTEM, lang)}
            </span>
          </div>
          {track && <BulletinAge issuedAt={track.issued_at ?? track.fetched_at} source={track.source} />}

          {hasSignalWarning && (
            <p lang={lang} className="font-medium text-severity-orange">
              {t(SIGNAL_WARNING, lang)} — {t(SIGNAL_WARNING, `en` as "en")}: {track!.wind_signal}
            </p>
          )}

          {thunderstorm && (
            <p lang={lang} className="font-medium text-severity-orange">
              {t(THUNDERSTORM_WATCH, lang)}
            </p>
          )}

          <div className="my-2 h-px bg-border" />

          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(HEAT_INDEX, lang)}</span>
            <span className="font-medium tabular-nums">
              {heatIndex === null || heatCategory === null ? "—" : heatIndex + "°C · " + t(HEAT_CATEGORY_LABEL[heatCategory], lang)}
            </span>
          </div>

          {landslideCaution && (
            <p lang={lang} className="font-medium text-severity-red">
              {t(LANDSLIDE_CAUTION, lang)}
            </p>
          )}

          <p lang={lang} className="pt-1 text-xs text-muted-foreground">
            {t(current ? SOURCE : NO_READING, lang)}.
          </p>
        </div>
      )}
    </div>
  );
}
