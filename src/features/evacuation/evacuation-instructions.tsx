"use client";

import { Building2, Navigation, Phone, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { CENTER_STATUS_CLASS, CENTER_STATUS_LABEL } from "@/lib/center-status";
import { useZoneOverrides, resolveEffectiveCenterStatus } from "@/lib/zone-overrides";
import type { LocalizedText, Zone } from "@/lib/types";

const GO_HERE: LocalizedText = { en: "Go here", fil: "Pumunta rito" };
const CAPACITY: LocalizedText = { en: "Capacity", fil: "Kapasidad" };
const HOW_TO_GET_THERE: LocalizedText = { en: "How to get there", fil: "Paano makarating" };
const CALL: LocalizedText = { en: "Call", fil: "Tawagan" };
const SPOTS_LEFT: LocalizedText = { en: "spots left", fil: "espasyong natitira" };

export function EvacuationInstructions({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();
  const occupancy = overrides[zone.id]?.currentOccupancy;
  const centerStatus = resolveEffectiveCenterStatus(
    zone.centerStatus,
    overrides[zone.id]?.centerStatus,
    zone.evacuationCenterCapacity,
    occupancy
  );

  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-start gap-4">
          <Building2
            data-testid="icon-evacuation-center"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{t(GO_HERE, lang)}</p>
            <p className="text-lg font-semibold">{zone.evacuationCenterName}</p>
          </div>
        </div>

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

        <a
          href={`tel:${zone.hotlineNumber}`}
          className="flex items-center gap-4 rounded-md border-2 border-severity-red p-3"
        >
          <Phone
            data-testid="icon-hotline"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <span className="text-base font-medium">{t(CALL, lang)} {zone.hotlineNumber}</span>
        </a>
      </CardContent>
    </Card>
  );
}
