"use client";

import { Building2, Navigation, Phone, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { Zone } from "@/lib/types";

const CENTER_STATUS_LABEL = {
  en: { space_available: "Space available", limited: "Limited space", full: "Full" },
  fil: { space_available: "May espasyo", limited: "Kakaunting espasyo", full: "Puno na" },
};

const CENTER_STATUS_CLASS = {
  space_available: "bg-green-500/20 text-green-400",
  limited: "bg-yellow-500/20 text-yellow-400",
  full: "bg-red-500/20 text-red-400",
};

export function EvacuationInstructions({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();

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
            <p className="text-sm text-muted-foreground">Go here</p>
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
            <p className="text-sm text-muted-foreground">Capacity</p>
            <Badge className={CENTER_STATUS_CLASS[zone.centerStatus]}>
              {CENTER_STATUS_LABEL[lang][zone.centerStatus]}
            </Badge>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <Navigation
            data-testid="icon-route"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div>
            <p className="text-sm text-muted-foreground">How to get there</p>
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
          <span className="text-base font-medium">Call {zone.hotlineNumber}</span>
        </a>
      </CardContent>
    </Card>
  );
}
