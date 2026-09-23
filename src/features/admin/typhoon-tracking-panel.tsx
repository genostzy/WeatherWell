"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BulletinAge } from "@/components/bulletin-age";
import { Wind, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useTyphoon, type TyphoonTrack } from "@/lib/use-typhoon";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Typhoon Tracking", fil: "Pagsubaybay sa Bagyo" };
const NO_ACTIVE_SYSTEM: LocalizedText = {
  en: "No active tropical cyclone.",
  fil: "Walang aktibong bagyo sa ngayon.",
};
const DISTANCE: LocalizedText = { en: "Position", fil: "Posisyon" };
const WINDS: LocalizedText = { en: "Max Winds", fil: "Pinakamalakas na Hangin" };
const GUSTS: LocalizedText = { en: "Gustiness", fil: "Bugso" };
const PRESSURE: LocalizedText = { en: "Pressure", fil: "Presyon" };
const MOVEMENT: LocalizedText = { en: "Movement", fil: "Galaw" };
const SIGNAL: LocalizedText = { en: "Wind Signal", fil: "Signal sa Hangin" };
const BULLETIN: LocalizedText = { en: "Bulletin", fil: "Bulletin" };
const LOADING: LocalizedText = { en: "Loading...", fil: "Naglo-load..." };
const ERROR_PREFIX: LocalizedText = { en: "Error:", fil: "Error:" };
const KMH: LocalizedText = { en: "km/h", fil: "km/h" };
const HPA: LocalizedText = { en: "hPa", fil: "hPa" };

function SignalBadge({ level }: { level: number }) {
  if (level === 0) return null;
  const colors: Record<number, string> = {
    1: "bg-blue-500",
    2: "bg-green-500",
    3: "bg-yellow-500",
    4: "bg-orange-500",
    5: "bg-red-500",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white ${colors[level] ?? "bg-gray-500"}`}>
      <AlertTriangle aria-hidden="true" className="h-3 w-3" />
      {t(SIGNAL, `en` as "en")} {level}
    </span>
  );
}

export function TyphoonTrackingPanel() {
  const { lang } = useLanguage();
  const { track, isLoading, error } = useTyphoon();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wind aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
          {track && <SignalBadge level={track.wind_signal} />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t(LOADING, lang)}</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            {t(ERROR_PREFIX, lang)} {error}
          </p>
        ) : track ? (
          <TyphoonDetails track={track} />
        ) : (
          <p className="text-sm text-muted-foreground">{t(NO_ACTIVE_SYSTEM, lang)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function TyphoonDetails({ track }: { track: TyphoonTrack }) {
  const { lang } = useLanguage();
  const position = track.positions[0];

  return (
    <div className="space-y-2">
      <p className="text-lg font-semibold">
        {track.name}
        {track.international_name && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({track.international_name})
          </span>
        )}
      </p>
      <p lang={lang} className="text-sm text-muted-foreground">
        {t(track.category, lang)}
      </p>
      <BulletinAge issuedAt={track.issued_at ?? track.fetched_at} />

      {track.headline && (
        <p lang={lang} className="text-sm font-medium text-severity-orange">
          {track.headline}
        </p>
      )}

      {position && (
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(DISTANCE, lang)}</span>
            <span className="text-right font-medium tabular-nums">
              {position.lat.toFixed(1)}°N, {position.lng.toFixed(1)}°E
            </span>
          </div>
          {position.description && (
            <p className="text-xs text-muted-foreground">{position.description}</p>
          )}
        </div>
      )}

      <div className="space-y-1 text-sm">
        {track.max_winds_kph != null && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(WINDS, lang)}</span>
            <span className="font-medium tabular-nums">
              {track.max_winds_kph} {t(KMH, lang)}
            </span>
          </div>
        )}
        {track.gustiness_kph != null && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(GUSTS, lang)}</span>
            <span className="font-medium tabular-nums">
              {track.gustiness_kph} {t(KMH, lang)}
            </span>
          </div>
        )}
        {track.pressure_hpa != null && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(PRESSURE, lang)}</span>
            <span className="font-medium tabular-nums">
              {track.pressure_hpa} {t(HPA, lang)}
            </span>
          </div>
        )}
        {track.movement_direction && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t(MOVEMENT, lang)}</span>
            <span className="font-medium">
              {track.movement_direction}
              {track.movement_speed_kph != null &&
                ` at ${track.movement_speed_kph} ${t(KMH, lang)}`}
            </span>
          </div>
        )}
      </div>

      {track.signals.length > 0 && (
        <div className="mt-2 space-y-1">
          {track.signals.map((signal) => (
            <div key={signal.signalLevel} className="text-xs">
              <span className="font-medium">{t(SIGNAL, lang)} {signal.signalLevel}:</span>{" "}
              <span className="text-muted-foreground">
                {signal.areas.length} {lang === "en" ? "areas" : "lugar"}
              </span>
            </div>
          ))}
        </div>
      )}

      {track.bulletin_number && (
        <p className="text-xs text-muted-foreground">
          {t(BULLETIN, lang)} #{track.bulletin_number}
          {track.is_final ? " (FINAL)" : ""}
          {track.source !== "unknown" && ` — source: ${track.source}`}
        </p>
      )}
    </div>
  );
}
