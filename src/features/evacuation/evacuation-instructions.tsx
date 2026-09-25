"use client";

import { Building2, Navigation, Phone, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReadAloudButton } from "@/features/alerts/read-aloud-button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { CENTER_STATUS_CLASS, CENTER_STATUS_LABEL, resolveEffectiveCenterStatus } from "@/lib/center-status";
import { hasRealEvacuationCenter, NO_VERIFIED_CENTER, hasRealHotline } from "@/lib/zone-data-quality";
import type { LocalizedText, Zone } from "@/lib/types";

const GO_HERE: LocalizedText = { en: "Go here", fil: "Pumunta rito" };
const CAPACITY: LocalizedText = { en: "Capacity", fil: "Kapasidad" };
const HOW_TO_GET_THERE: LocalizedText = { en: "How to get there", fil: "Paano makarating" };
const CALL: LocalizedText = { en: "Call", fil: "Tawagan" };
const CALL_911: LocalizedText = { en: "Call 911 — national emergency", fil: "Tumawag sa 911 — pambansang emergency" };
const SPOTS_LEFT: LocalizedText = { en: "spots left", fil: "espasyong natitira" };

export function EvacuationInstructions({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  // The live headcount an operator most recently entered, carried through
  // reference data as zone.currentOccupancy — undefined if none was ever
  // recorded, in which case resolveEffectiveCenterStatus falls back to the
  // zone's own centerStatus.
  const occupancy = zone.currentOccupancy;
  const centerStatus = resolveEffectiveCenterStatus(zone.centerStatus, zone.evacuationCenterCapacity, occupancy);
  const realCenter = hasRealEvacuationCenter(zone);
  // What the card says, in the order it says it, for a resident who can't read it.
  const spoken = (language: "en" | "fil") =>
    [
      `${t(GO_HERE, language)}: ${realCenter ? zone.evacuationCenterName : t(NO_VERIFIED_CENTER, language)}`,
      `${t(HOW_TO_GET_THERE, language)}: ${t(zone.evacuationRouteText, language)}`,
      hasRealHotline(zone) ? `${t(CALL, language)} ${zone.hotlineNumber}` : t(CALL_911, language),
    ].join(". ");

  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-6 pt-6">
        <ReadAloudButton text={{ en: spoken("en"), fil: spoken("fil") }} lang={lang} />
        <div className="flex items-start gap-4">
          <Building2
            data-testid="icon-evacuation-center"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{t(GO_HERE, lang)}</p>
            {realCenter ? (
              <p className="text-lg font-semibold">{zone.evacuationCenterName}</p>
            ) : (
              <p lang={lang} className="text-lg font-semibold">
                {t(NO_VERIFIED_CENTER, lang)}
              </p>
            )}
          </div>
        </div>

        {realCenter && (
        <div className="flex items-start gap-4">
          <Users
            data-testid="icon-capacity"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div>
            <p className="text-sm text-muted-foreground">{t(CAPACITY, lang)}</p>
            <Badge className={CENTER_STATUS_CLASS[centerStatus]}>
              {t(CENTER_STATUS_LABEL[centerStatus], lang)}
            </Badge>
            {occupancy !== undefined && (
              <p className="mt-1 text-sm text-muted-foreground">
                {Math.max(0, zone.evacuationCenterCapacity - occupancy)} {t(SPOTS_LEFT, lang)}
              </p>
            )}
          </div>
        </div>
        )}

        <div className="flex items-start gap-4">
          <Navigation
            data-testid="icon-route"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div>
            <p className="text-sm text-muted-foreground">{t(HOW_TO_GET_THERE, lang)}</p>
            <p lang={lang} className="text-base">
              {t(zone.evacuationRouteText, lang)}
            </p>
          </div>
        </div>

        {/* No verified hotline: 911 is the national emergency number, and a
            resident reading this in an emergency needs something that rings. */}
        <a
          href={`tel:${hasRealHotline(zone) ? zone.hotlineNumber : "911"}`}
          className="flex items-center gap-4 rounded-md border-2 border-severity-red p-3"
        >
          <Phone
            data-testid="icon-hotline"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <span lang={lang} className="text-base font-medium">
            {hasRealHotline(zone) ? `${t(CALL, lang)} ${zone.hotlineNumber}` : t(CALL_911, lang)}
          </span>
        </a>
      </CardContent>
    </Card>
  );
}
