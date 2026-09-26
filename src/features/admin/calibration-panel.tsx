"use client";

import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeAgo } from "@/components/time-ago";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useZones } from "@/lib/reference-data/use-reference-data";
import { alertBar } from "@/lib/weather-thresholds";
import type { LanguageCode, LocalizedText } from "@/lib/types";

export type CalibrationKind = "confirmed" | "rejected" | "expired" | "missed";

export interface CalibrationEvent {
  id: number;
  zoneId: string;
  kind: CalibrationKind;
  stepBefore: number;
  stepAfter: number;
  occurredAt: string;
}

const TITLE: LocalizedText = { en: "Calibration", fil: "Pagsasaayos" };
const HOW: LocalizedText = {
  en: "Each barangay's bar for an automatic advisory starts at 3 located reporters and trust 1.0. Rejected advisories raise it a step; an alert the engine missed brings it back down, never below that.",
  fil: "Nagsisimula ang pamantayan ng bawat barangay para sa awtomatikong paalala sa 3 residenteng may lokasyon at tiwalang 1.0. Tumataas ito ng isang hakbang sa mga tinanggihang paalala; bumababa ito kapag may alertong hindi nahuli ng sistema, pero hindi bababa roon.",
};
const RAISED: LocalizedText = { en: "Raised bars", fil: "Itinaas na pamantayan" };
const OUTCOMES: LocalizedText = { en: "Each advisory against what happened", fil: "Bawat paalala laban sa nangyari" };
const NONE: LocalizedText = {
  en: "No outcomes yet. The record starts with the first automatic advisory officials confirm or reject.",
  fil: "Wala pang resulta. Magsisimula ang talaan sa unang awtomatikong paalalang kinumpirma o tinanggihan ng opisyal.",
};
const KIND: Record<CalibrationKind, LocalizedText> = {
  confirmed: { en: "Confirmed by an official", fil: "Kinumpirma ng opisyal" },
  rejected: { en: "Rejected by an official", fil: "Tinanggihan ng opisyal" },
  expired: { en: "Expired without a verdict", fil: "Nag-expire nang walang pasya" },
  missed: { en: "Missed: an official raised the alert", fil: "Hindi nahuli: opisyal ang nagtaas ng alerto" },
};
const RAISED_TO: LocalizedText = { en: "bar raised to", fil: "itinaas ang pamantayan sa" };
const LOWERED_TO: LocalizedText = { en: "bar lowered to", fil: "ibinaba ang pamantayan sa" };

/** "4 located reporters, trust 1.25" for a step. */
function describeBar(step: number, lang: LanguageCode, located = true): string {
  const { reporters, trust } = alertBar(step);
  const trustText = trust.toFixed(2).replace(/0$/, "");
  if (lang === "fil") return `${reporters} residente${located ? " na may lokasyon" : ""}, tiwalang ${trustText}`;
  return `${reporters} ${located ? "located " : ""}reporters, trust ${trustText}`;
}

/**
 * The calibration loop's record for officials (Stage 4 Task 3): which
 * barangays' bars moved, and each automatic advisory against what happened
 * to it. The database keeps the record; this only reads it.
 */
export function CalibrationPanel({ bars, events }: { bars: Record<string, number>; events: CalibrationEvent[] }) {
  const { lang } = useLanguage();
  const zones = useZones();
  const nameOf = (zoneId: string) => zones.find((zone) => zone.id === zoneId)?.name ?? zoneId;
  const raised = Object.entries(bars).filter(([, step]) => step > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge aria-hidden="true" className="h-5 w-5" />
          <span lang={lang}>{t(TITLE, lang)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p lang={lang} className="text-muted-foreground">
          {t(HOW, lang)}
        </p>

        {raised.length > 0 && (
          <section className="space-y-2">
            <h3 lang={lang} className="font-semibold">
              {t(RAISED, lang)}
            </h3>
            <ul className="space-y-1">
              {raised.map(([zoneId, step]) => (
                <li key={zoneId} lang={lang}>
                  <span className="font-medium">{nameOf(zoneId)}</span>: {describeBar(step, lang)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <h3 lang={lang} className="font-semibold">
            {t(OUTCOMES, lang)}
          </h3>
          {events.length === 0 ? (
            <p lang={lang} className="text-muted-foreground">
              {t(NONE, lang)}
            </p>
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.id} lang={lang} className="rounded-md border-2 border-border p-2">
                  <span className="font-medium">{nameOf(event.zoneId)}</span> · {t(KIND[event.kind], lang)}
                  {event.stepAfter !== event.stepBefore && (
                    <>
                      {" "}
                      · {t(event.stepAfter > event.stepBefore ? RAISED_TO : LOWERED_TO, lang)}{" "}
                      {describeBar(event.stepAfter, lang, false)}
                    </>
                  )}
                  <TimeAgo reportedAt={event.occurredAt} prefix=" · " className="text-muted-foreground" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
